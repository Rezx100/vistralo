# Cookies and device storage — DRAFT, NOT PUBLISHED

The app at https://app.vistralo.com keeps the Supabase sign-in session in browser storage so a signed-in user stays signed in; signing out removes it. During a resumable upload, browser storage also holds a reference to that upload, removed when the upload completes or is invalidated. Confirm the exact keys and lifetimes before publishing. The website https://vistralo.com sets no cookies and uses no browser storage.

There are no advertising or analytics scripts on either site. Verify again before publishing, and whenever a third-party script is added. Explain these essential storage operations in the final privacy notice. If non-essential analytics, tracking or similar device storage is added, assess EU and UK consent requirements and implement controls **before** setting it; a generic banner alone does not make the practice compliant.

Operator Dynamix LTD · Website https://vistralo.com · Contact contact@vistralo.com · Effective `{{EFFECTIVE_DATE}}`.
