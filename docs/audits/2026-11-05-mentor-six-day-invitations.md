# Six-day mentor invitations

- Changed `mentorshipPolicy.expiryDays` from 14 to 6. Both owner invitations and lecturer offers use this policy when creating a request.
- Countdown starts when sent. Unsent candidates have no request deadline; an idempotent retry preserves the original expiry.
- Updated invitation guidance, current recruitment documentation and persistence test expectations. Historical migrations and previously sent requests retain their original expiry. No migration required.
- Verified: 40 web tests and 4 mentorship rules unit tests passed; backend production TypeScript compilation and web production build passed.
- After Docker restarted, all 117 PostgreSQL integration tests passed across mentor access, recruitment plan, mentorship workflow and academic relationships.
- Published the backend policy and web build to localhost with deployment backups. Runtime policy reports `expiryDays: 6`; backend `/health` and `/ready` return 200. The served web entry matches the build, and all eight entry assets return 200.
