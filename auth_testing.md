# Auth Testing Playbook - YourMovie's

## Auth Strategies
This app supports TWO auth flows:
1. **JWT** (email/password) — POST /api/auth/register, POST /api/auth/login → returns `{token, user}`. Use `Authorization: Bearer <token>` header.
2. **Emergent Google Auth** — user hits `https://auth.emergentagent.com/?redirect=<origin>/auth/callback`. Callback processes `#session_id=...` fragment, calls POST /api/auth/session which sets an httpOnly `session_token` cookie.

## Backend Auth Dependency
`get_current_user` checks:
- Authorization: Bearer <jwt> header FIRST
- Then session_token cookie (Emergent OAuth)

## Test User Creation (JWT)
```bash
curl -X POST "$API/auth/register" -H "Content-Type: application/json" \
  -d '{"email":"admin@yourmovies.app","password":"Admin123!","name":"Admin"}'
```
First registered user becomes admin automatically.

## Test Session Creation (Emergent, mongosh)
```
use('test_database');
var userId = 'user_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.' + Date.now() + '@example.com',
  name: 'Test User',
  picture: null,
  is_admin: true,
  auth_provider: 'google',
  created_at: new Date().toISOString()
});
db.user_sessions.insertOne({
  session_token: 'test_session_' + Date.now(),
  user_id: userId,
  expires_at: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
  created_at: new Date().toISOString()
});
```

## Browser Cookie Test
```
await page.context.add_cookies([{
  "name": "session_token", "value": "TOKEN", "domain": "<host>", "path": "/",
  "httpOnly": true, "secure": true, "sameSite": "None"
}])
```
