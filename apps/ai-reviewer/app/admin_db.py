"""Administrative reporting. Monetary totals use paid orders; credit totals use the ledger."""
import time
from datetime import timedelta


class AdminMixin:
    def initialize_admin(self):
        with self.connect() as c:
            c.executescript('''
                CREATE TABLE IF NOT EXISTS user_activity (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
                    actor_id INTEGER REFERENCES users(id), action TEXT NOT NULL, entity_id INTEGER,
                    detail TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_activity_user ON user_activity(user_id,id);
                CREATE INDEX IF NOT EXISTS idx_ledger_user ON credit_ledger(user_id,id);
                CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id,created_at);
            ''')
            # Only explicit business metadata is logged, never manuscripts, tokens or keys.
            triggers = [
                ('paper_uploaded', 'papers', 'INSERT', 'NEW.owner_id', 'NEW.id', "'{}'", 'NEW.owner_id IS NOT NULL'),
                ('paper_deleted', 'papers', 'DELETE', 'OLD.owner_id', 'OLD.id', "json_object('bytes',OLD.file_size)", 'OLD.owner_id IS NOT NULL'),
                ('review_created', 'reviews', 'INSERT', '(SELECT owner_id FROM papers WHERE id=NEW.paper_id)', 'NEW.id', "json_object('status',NEW.status)", '(SELECT owner_id FROM papers WHERE id=NEW.paper_id) IS NOT NULL'),
                ('review_status', 'reviews', 'UPDATE OF status', '(SELECT owner_id FROM papers WHERE id=NEW.paper_id)', 'NEW.id', "json_object('status',NEW.status)", 'OLD.status!=NEW.status AND (SELECT owner_id FROM papers WHERE id=NEW.paper_id) IS NOT NULL'),
                ('format_created', 'format_checks', 'INSERT', 'NEW.owner_id', 'NEW.id', "json_object('status',NEW.status)", '1'),
                ('format_status', 'format_checks', 'UPDATE OF status', 'NEW.owner_id', 'NEW.id', "json_object('status',NEW.status)", 'OLD.status!=NEW.status'),
                ('credit', 'credit_ledger', 'INSERT', 'NEW.user_id', 'NEW.id', "json_object('kind',NEW.kind,'delta',NEW.delta,'reference',NEW.reference)", '1'),
                ('order_created', 'orders', 'INSERT', 'NEW.user_id', 'NEW.id', "json_object('amount',NEW.amount,'credits',NEW.credits)", '1'),
                ('order_status', 'orders', 'UPDATE OF status', 'NEW.user_id', 'NEW.id', "json_object('status',NEW.status)", 'OLD.status!=NEW.status'),
                ('login', 'sessions', 'INSERT', 'NEW.user_id', 'NULL', "'{}'", '1'),
            ]
            for action, table, event, user, entity, detail, condition in triggers:
                c.execute(f'''CREATE TRIGGER IF NOT EXISTS activity_{action} AFTER {event} ON {table}
                    WHEN {condition} BEGIN
                    INSERT INTO user_activity(user_id,action,entity_id,detail) VALUES({user},'{action}',{entity},{detail}); END''')

    def admin_financials(self, c, start=None, end=None, user_id=None):
        def where(column):
            terms, args = [], []
            if start:
                terms += [f'datetime({column})>=?', f'datetime({column})<?']
                args += [str(start), str(end + timedelta(days=1))]
            if user_id is not None:
                terms.append('user_id=?'); args.append(user_id)
            return (' AND '.join(terms) or '1'), args
        clause, args = where('paid_at')
        paid = dict(c.execute(f"SELECT COUNT(*) paid_orders,COALESCE(SUM(amount),0) revenue_vnd,COALESCE(SUM(credits),0) paid_credits FROM orders WHERE status='paid' AND {clause}", args).fetchone())
        clause, args = where('created_at')
        credit = dict(c.execute(f'''SELECT
            COALESCE(SUM(CASE WHEN kind='topup' THEN delta ELSE 0 END),0) topup_credits,
            COALESCE(SUM(CASE WHEN kind='refund' THEN delta ELSE 0 END),0) refunded_credits,
            COALESCE(SUM(CASE WHEN kind='review' AND delta<0 THEN -delta ELSE 0 END),0) review_credits,
            COALESCE(SUM(CASE WHEN kind='storage' AND delta<0 THEN -delta ELSE 0 END),0) storage_credits,
            COALESCE(SUM(CASE WHEN delta<0 THEN -delta ELSE 0 END),0) spent_credits
            FROM credit_ledger WHERE {clause}''', args).fetchone())
        return {**paid, **credit, 'net_spent_credits': credit['spent_credits'] - credit['refunded_credits']}

    def admin_dashboard(self, start, end):
        with self.connect() as c:
            c.execute('BEGIN')
            financial = self.admin_financials(c, start, end)
            current = dict(c.execute('''SELECT COUNT(*) users,COALESCE(SUM(disabled=0),0) active_users,
                COALESCE(SUM(credits),0) outstanding_credits FROM users''').fetchone())
            current.update(dict(c.execute('SELECT COUNT(*) papers,COALESCE(SUM(file_size),0) pdf_bytes FROM papers').fetchone()))
            current['artifact_bytes'] = c.execute("SELECT COALESCE(SUM(size),0) FROM stored_files WHERE kind='artifact'").fetchone()[0]
            current['used_bytes'] = current['pdf_bytes'] + current['artifact_bytes']
            current['files'] = [dict(r) for r in c.execute('SELECT backend,COUNT(*) count,COALESCE(SUM(size),0) bytes FROM stored_files GROUP BY backend')]
            current['uploads_reserved_bytes'] = c.execute('SELECT COALESCE(SUM(bytes),0) FROM upload_reservations').fetchone()[0]
            current['jobs'] = {table: [dict(r) for r in c.execute(f'SELECT status,COUNT(*) count FROM {table} GROUP BY status')] for table in ('reviews', 'format_checks')}
            args = (str(start), str(end + timedelta(days=1)))
            revenue = {r['day']: dict(r) for r in c.execute("SELECT date(paid_at) day,SUM(amount) revenue_vnd,COUNT(*) paid_orders FROM orders WHERE status='paid' AND datetime(paid_at)>=? AND datetime(paid_at)<? GROUP BY day", args)}
            credits = {r['day']: dict(r) for r in c.execute('''SELECT date(created_at) day,
                SUM(CASE WHEN kind='topup' THEN delta ELSE 0 END) topup_credits,
                SUM(CASE WHEN delta<0 THEN -delta ELSE 0 END) spent_credits,
                SUM(CASE WHEN kind='refund' THEN delta ELSE 0 END) refunded_credits
                FROM credit_ledger WHERE datetime(created_at)>=? AND datetime(created_at)<? GROUP BY day''', args)}
            daily = []
            for day in (start + timedelta(days=n) for n in range((end-start).days+1)):
                key = str(day)
                daily.append({'day': key, 'revenue_vnd': 0, 'paid_orders': 0, 'topup_credits': 0,
                              'spent_credits': 0, 'refunded_credits': 0, **revenue.get(key, {}), **credits.get(key, {})})
            return {'start': str(start), 'end': str(end), 'timezone': 'UTC', 'financial': financial, 'current': current, 'daily': daily}

    def admin_users(self, q='', status='all', page=1, limit=25):
        terms, args = ['1'], []
        if q:
            terms.append('(u.name LIKE ? OR u.email LIKE ? OR CAST(u.id AS TEXT)=?)')
            args += [f'%{q}%', f'%{q}%', q]
        if status != 'all':
            terms.append('u.disabled=?'); args.append(int(status == 'inactive'))
        clause = ' AND '.join(terms)
        with self.connect() as c:
            c.execute('BEGIN')
            total = c.execute(f'SELECT COUNT(*) FROM users u WHERE {clause}', args).fetchone()[0]
            rows = c.execute(f'''SELECT u.id,u.email,u.name,u.role,u.disabled,u.credits,u.created_at,
                (SELECT COUNT(*) FROM papers p WHERE p.owner_id=u.id) papers,
                (SELECT COALESCE(SUM(file_size),0) FROM papers p WHERE p.owner_id=u.id) +
                (SELECT COALESCE(SUM(f.size),0) FROM stored_files f JOIN papers p ON p.id=f.paper_id WHERE p.owner_id=u.id AND f.kind='artifact') used_bytes,
                (SELECT MAX(created_at) FROM user_activity a WHERE a.user_id=u.id AND action='login') last_login
                FROM users u WHERE {clause} ORDER BY u.id DESC LIMIT ? OFFSET ?''', [*args, limit, (page-1)*limit])
            return {'items': [dict(r) for r in rows], 'total': total, 'page': page, 'limit': limit,
                    'unassigned_papers': c.execute('SELECT COUNT(*) FROM papers WHERE owner_id IS NULL').fetchone()[0]}

    def admin_user_detail(self, user_id):
        with self.connect() as c:
            c.execute('BEGIN')
            user = c.execute('SELECT id,email,name,affiliation,bio,role,disabled,credits,created_at FROM users WHERE id=?', (user_id,)).fetchone()
            if not user:
                return None
            usage = self.storage_usage(user_id, c)
            sub = self.subscription(user_id, c)
            return {'user': dict(user), 'storage': usage, 'subscription': sub,
                'library_locked': sub['expired'] and usage['over_quota'],
                'financial': self.admin_financials(c, user_id=user_id),
                'jobs': {table: [dict(r) for r in c.execute(f'''SELECT j.status,COUNT(*) count FROM {table} j
                    JOIN papers p ON p.id=j.paper_id WHERE p.owner_id=? GROUP BY j.status''', (user_id,))] for table in ('reviews', 'format_checks')},
                'active_sessions': c.execute('SELECT COUNT(*) FROM sessions WHERE user_id=? AND expires_at>?', (user_id, int(time.time()))).fetchone()[0],
                'budgets': [dict(r) for r in c.execute('SELECT action,window,count FROM usage_budgets WHERE user_id=? ORDER BY window DESC,action', (user_id,))]}

    def admin_records(self, kind, user_id=None, page=1, limit=25, status='', start=None, end=None):
        # Every SQL identifier below is chosen here, never from a query parameter.
        config = {
            'orders': ('orders r', 'r.user_id', 'r.created_at', 'r.id,r.user_id,r.amount,r.credits,r.status,r.created_at,r.paid_at'),
            'credits': ('credit_ledger r', 'r.user_id', 'r.created_at', 'r.id,r.user_id,r.delta,r.kind,r.reference,r.created_at'),
            'activity': ('user_activity r', 'r.user_id', 'r.created_at', 'r.id,r.user_id,r.actor_id,r.action,r.entity_id,r.detail,r.created_at'),
            'audit': ('admin_audit r', 'r.actor_id', 'r.created_at', 'r.id,r.actor_id,r.action,r.detail,r.created_at'),
            'papers': ('papers r', 'r.owner_id', 'r.uploaded_at', "r.id,r.owner_id,r.title,r.filename,r.status,r.file_size,r.uploaded_at,r.deletion_pending,(SELECT COALESCE(SUM(size),0) FROM stored_files f WHERE f.paper_id=r.id AND kind='artifact') artifact_bytes,(SELECT COUNT(*) FROM stored_files f WHERE f.paper_id=r.id AND backend='drive') drive_files"),
        }
        source, owner, stamp, fields = config[kind]
        terms, args = ['1'], []
        if user_id is not None:
            terms.append(f'{owner}=?'); args.append(user_id)
        if status and kind == 'orders':
            terms.append('r.status=?'); args.append(status)
        if start:
            terms += [f'datetime({stamp})>=?', f'datetime({stamp})<?']
            args += [str(start), str(end + timedelta(days=1))]
        clause = ' AND '.join(terms)
        with self.connect() as c:
            c.execute('BEGIN')
            total = c.execute(f'SELECT COUNT(*) FROM {source} JOIN users u ON u.id={owner} WHERE {clause}', args).fetchone()[0]
            rows = [dict(r) for r in c.execute(f'''SELECT {fields},u.email,u.name FROM {source}
                JOIN users u ON u.id={owner} WHERE {clause} ORDER BY r.id DESC LIMIT ? OFFSET ?''', [*args, limit, (page-1)*limit])]
            return {'items': rows, 'total': total, 'page': page, 'limit': limit}
