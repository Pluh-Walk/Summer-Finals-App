# BillSplitts — Supabase Setup Guide

## Step 1: Create a Supabase Project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard) and sign in.
2. Click **New Project**.
3. Enter a project name (e.g., `billsplitts`), set a strong database password, and choose a region.
4. Click **Create new project** and wait ~2 minutes for it to launch.

---

## Step 2: Get Your API Keys

1. In the Supabase Dashboard, go to **Project Settings → API**.
2. Copy:
   - **Project URL** → this is `EXPO_PUBLIC_SUPABASE_URL`
   - **anon / public key** → this is `EXPO_PUBLIC_SUPABASE_ANON_KEY`
3. Create a `.env` file in the root of this project (copy `.env.example`):

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

---

## Step 3: Configure Authentication

1. Go to **Authentication → Providers → Email**.
2. Enable **Email** provider.
3. For development, you may **disable "Confirm email"** so users can log in immediately after registration. For production, keep it enabled and configure a custom SMTP.
4. Go to **Authentication → Email Templates**.
5. Customize the **Confirm signup** template to match the welcome email requirement:
   - Subject: `Welcome to BillSplitts! 🎉`
   - Customize the body to include a welcome message and a link to the login page (`billsplitts://login`).

---

## Step 4: Run the Database Schema SQL

Go to **SQL Editor** in your Supabase Dashboard and run the following SQL:

```sql
-- ============================================================
-- PROFILES TABLE
-- ============================================================
CREATE TABLE public.profiles (
  id          UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  last_name   TEXT NOT NULL,
  first_name  TEXT NOT NULL,
  nickname    TEXT NOT NULL UNIQUE,
  email       TEXT NOT NULL,
  username    TEXT NOT NULL UNIQUE,
  account_type TEXT NOT NULL DEFAULT 'standard'
              CHECK (account_type IN ('standard', 'premium')),
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================
-- BILLS TABLE
-- ============================================================
CREATE TABLE public.bills (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name            TEXT NOT NULL,
  invitation_code TEXT NOT NULL UNIQUE,
  host_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'archived')),
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================
-- BILL PARTICIPANTS TABLE
-- ============================================================
CREATE TABLE public.bill_participants (
  id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_id   UUID REFERENCES public.bills(id) ON DELETE CASCADE NOT NULL,
  user_id   UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status    TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'accepted')),
  joined_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (bill_id, user_id)
);

-- ============================================================
-- EXPENSES TABLE
-- ============================================================
CREATE TABLE public.expenses (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_id     UUID REFERENCES public.bills(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  amount      NUMERIC(10, 2) NOT NULL DEFAULT 0,
  paid_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  split_type  TEXT NOT NULL DEFAULT 'equal'
              CHECK (split_type IN ('equal', 'custom')),
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================
-- EXPENSE SPLITS TABLE
-- ============================================================
CREATE TABLE public.expense_splits (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id   UUID REFERENCES public.expenses(id) ON DELETE CASCADE NOT NULL,
  user_id      UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  share_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  UNIQUE (expense_id, user_id)
);

-- ============================================================
-- AUTO-UPDATE updated_at ON bills
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER bills_updated_at
  BEFORE UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SET search_path = ''
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, last_name, first_name, nickname, email, username)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'nickname',
    NEW.email,
    NEW.raw_user_meta_data->>'username'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER FUNCTIONS FOR RLS CHECKS
-- These avoid policy recursion between bills and bill_participants.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_bill_host(target_bill_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bills
    WHERE id = target_bill_id
      AND host_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_bill_participant(target_bill_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bill_participants
    WHERE bill_id = target_bill_id
      AND user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_bill_accepted_participant(target_bill_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bill_participants
    WHERE bill_id = target_bill_id
      AND user_id = (SELECT auth.uid())
      AND status = 'accepted'
  );
$$;

-- PROFILES POLICIES
CREATE POLICY "Anyone can view profiles"
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING ((SELECT auth.uid()) = id);

-- BILLS POLICIES
CREATE POLICY "Users can view their bills"
  ON public.bills FOR SELECT
  USING (
    host_id = (SELECT auth.uid())
    OR public.is_bill_participant(id)
  );

CREATE POLICY "Authenticated users can create bills"
  ON public.bills FOR INSERT
  WITH CHECK (host_id = (SELECT auth.uid()));

CREATE POLICY "Hosts can update their bills"
  ON public.bills FOR UPDATE
  USING (host_id = (SELECT auth.uid()));

CREATE POLICY "Hosts can delete their bills"
  ON public.bills FOR DELETE
  USING (host_id = (SELECT auth.uid()));

-- BILL PARTICIPANTS POLICIES
CREATE POLICY "Bill members can view participants"
  ON public.bill_participants FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_bill_host(bill_id)
  );

CREATE POLICY "Hosts can add participants"
  ON public.bill_participants FOR INSERT
  WITH CHECK (
    public.is_bill_host(bill_id)
    OR user_id = (SELECT auth.uid())
  );

CREATE POLICY "Participants and hosts can update participant status"
  ON public.bill_participants FOR UPDATE
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_bill_host(bill_id)
  );

CREATE POLICY "Hosts can remove participants"
  ON public.bill_participants FOR DELETE
  USING (
    public.is_bill_host(bill_id)
    OR user_id = (SELECT auth.uid())
  );

-- EXPENSES POLICIES
CREATE POLICY "Bill members can view expenses"
  ON public.expenses FOR SELECT
  USING (
    public.is_bill_host(bill_id)
    OR public.is_bill_accepted_participant(bill_id)
  );

CREATE POLICY "Bill members can add expenses"
  ON public.expenses FOR INSERT
  WITH CHECK (
    public.is_bill_host(bill_id)
    OR public.is_bill_accepted_participant(bill_id)
  );

CREATE POLICY "Hosts and payers can update expenses"
  ON public.expenses FOR UPDATE
  USING (
    paid_by = (SELECT auth.uid())
    OR public.is_bill_host(bill_id)
  );

CREATE POLICY "Hosts can delete expenses"
  ON public.expenses FOR DELETE
  USING (
    public.is_bill_host(bill_id)
  );

-- EXPENSE SPLITS POLICIES
CREATE POLICY "Bill members can view splits"
  ON public.expense_splits FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.expenses e
      WHERE e.id = expense_id
        AND (
          public.is_bill_host(e.bill_id)
          OR public.is_bill_accepted_participant(e.bill_id)
        )
    )
  );

CREATE POLICY "Bill members can add splits"
  ON public.expense_splits FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.expenses e
      WHERE e.id = expense_id
        AND (
          public.is_bill_host(e.bill_id)
          OR public.is_bill_accepted_participant(e.bill_id)
        )
    )
  );

CREATE POLICY "Allow delete splits with expense"
  ON public.expense_splits FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.expenses e
      WHERE e.id = expense_id
        AND public.is_bill_host(e.bill_id)
    )
  );
```

---

## Step 5: Grant Table Access (Important!)

Run this in the SQL Editor to ensure the `anon` and `authenticated` roles can access the tables:

```sql
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bills TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bill_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_splits TO authenticated;
```

---

## Step 6: Configure Deep Linking (Optional for Password Reset)

For the "Forgot Password" email link to work natively:

1. In Supabase Dashboard → **Authentication → URL Configuration**
2. Set **Site URL** to: `billsplitts://`
3. Add to **Redirect URLs**: `billsplitts://reset-password`

---

## Step 7: Run the App

1. Copy `.env.example` to `.env` and fill in your values.
2. Run:
   ```bash
   npx expo start --clear
   ```
3. Open on Android/iOS via Expo Go or a development build.

---

## Database Schema Overview

| Table               | Description                                      |
|---------------------|--------------------------------------------------|
| `profiles`          | User profile data (extends auth.users)           |
| `bills`             | Bill records with invitation code and status     |
| `bill_participants` | Users participating in a bill (pending/accepted) |
| `expenses`          | Individual expenses within a bill                |
| `expense_splits`    | Per-person share amounts for each expense        |

---

## Account Types

| Feature                  | Standard | Premium  |
|--------------------------|----------|----------|
| Bills per month          | 5        | Unlimited |
| Persons per bill         | 3        | Unlimited |
| All other features       | ✅       | ✅       |
