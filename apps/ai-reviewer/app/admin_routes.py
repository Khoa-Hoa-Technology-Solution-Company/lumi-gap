from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query


def admin_router(database, security):
    router = APIRouter(prefix='/api/admin', dependencies=[Depends(security.admin)])

    def period(start, end, default=False):
        if default and start is None and end is None:
            end = datetime.now(timezone.utc).date()
            start = end - timedelta(days=29)
        if (start is None) != (end is None) or (start and (start > end or (end-start).days > 365 or end == date.max)):
            raise HTTPException(422, 'Chọn đủ ngày bắt đầu/kết thúc, tối đa 366 ngày, ngày bắt đầu không sau ngày kết thúc.')
        return start, end

    @router.get('/dashboard')
    def dashboard(start: date | None = None, end: date | None = None):
        return database.admin_dashboard(*period(start, end, True))

    @router.get('/users')
    def users(q: str = Query('', max_length=200), status: Literal['all', 'active', 'inactive'] = 'all',
              page: int = Query(1, ge=1, le=1000000), limit: int = Query(25, ge=1, le=100)):
        return database.admin_users(q.strip(), status, page, limit)

    @router.get('/users/{user_id}')
    def user(user_id: int):
        result = database.admin_user_detail(user_id)
        if result is None:
            raise HTTPException(404, 'Không tìm thấy tài khoản')
        return result

    @router.get('/reports/{kind}')
    def records(kind: Literal['orders', 'credits', 'activity', 'audit', 'papers'],
                user_id: int | None = Query(None, ge=1), page: int = Query(1, ge=1, le=1000000),
                limit: int = Query(25, ge=1, le=100), status: str = Query('', max_length=30),
                start: date | None = None, end: date | None = None):
        start, end = period(start, end)
        return database.admin_records(kind, user_id, page, limit, status, start, end)

    return router
