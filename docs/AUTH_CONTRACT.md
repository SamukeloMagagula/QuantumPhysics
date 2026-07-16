# PhantomQ Auth Contract

> **v2 update:** PhantomQ now auto-provisions a **guest identity** (no login required).
> The login/signup pages have been removed; a real login is optional future work that
> would layer on top of the guest `users` row. The rest of this contract (the `users`
> table shape, session-by-user-id) still holds for anyone adding real auth later.

PhantomQ owns the user model, sessions, and auth endpoints. A teammate may
replace the login/signup **UI**. This document is the integration contract.

## Users table (SQLite)

```
users(
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,   -- Werkzeug generate_password_hash
  display_name  TEXT,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

Every new user must also get a `user_stats(user_id, points)` row (points = 0).

## Session

A logged-in user is identified solely by `session["user_id"] = users.id`
(Flask server-side signed cookie). Clearing the session logs out.

## Endpoints (current dev implementation)

- `GET/POST /auth/signup` — form fields `username`, `password`.
- `GET/POST /auth/login` — form fields `username`, `password`.
- `POST /auth/logout`.

## Two integration options

1. **Restyle the pages.** Keep posting to `/auth/login` and `/auth/signup`;
   only the templates `templates/auth/login.html` and `.../signup.html` change.
2. **Own the route.** Implement your own login view; on success, create the
   `users` (+ `user_stats`) row via `auth.service.create_user` and set
   `session["user_id"]`. Nothing else in the app needs to change.
