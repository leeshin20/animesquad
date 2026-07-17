# Own Feed Profile Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route the signed-in user's feed avatar and display-name links to `/profile` while preserving `/users/{id}` for everyone else.

**Architecture:** The shared `Timeline` receives an optional `currentUserId` from each feed page and computes one profile URL per item. Both the avatar and display-name links reuse that URL. No backend or public-profile page changes are required.

**Tech Stack:** Next.js 14, React 18, TypeScript, Node test runner, React server rendering

## Global Constraints

- Apply the behavior to both the main feed and squad feed.
- Apply the behavior to both the profile photo and the display name.
- Preserve the existing public-profile route for other users and when the current user is unknown.
- Do not change backend APIs or the public-profile page.

---

### Task 1: Route Own Timeline Profile Links

**Files:**
- Modify: `frontend/src/app/components/Timeline.test.tsx`
- Modify: `frontend/src/app/components/Timeline.tsx`
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/squads/[id]/page.tsx`

**Interfaces:**
- Consumes: `Me.id` and `FeedItem.actor.id`, both numeric user IDs.
- Produces: `Timeline({ items, showSquad?, currentUserId? })`, where `currentUserId?: number` controls the actor profile URL.

- [x] **Step 1: Write failing own-user and other-user link tests**

Add a feed item fixture and these assertions to `Timeline.test.tsx`:

```tsx
const item: FeedItemWithSquad = {
  id: 1,
  type: "PROGRESS_UPDATED",
  actor: { id: 7, displayName: "Alice", avatarUrl: null },
  anime: null,
  payload: { progress: 3 },
  createdAt: "2026-07-17T00:00:00Z",
};

test("links the current user's avatar and name to the editable profile", () => {
  const html = renderToStaticMarkup(<Timeline items={[item]} currentUserId={7} />);

  assert.equal(html.match(/href="\/profile"/g)?.length, 2);
  assert.doesNotMatch(html, /href="\/users\/7"/);
});

test("keeps another user's avatar and name linked to the public profile", () => {
  const html = renderToStaticMarkup(<Timeline items={[item]} currentUserId={8} />);

  assert.equal(html.match(/href="\/users\/7"/g)?.length, 2);
  assert.doesNotMatch(html, /href="\/profile"/);
});
```

Import `Timeline` and `FeedItemWithSquad` from `./Timeline`.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd frontend
npx tsx --test src/app/components/Timeline.test.tsx
```

Expected: TypeScript compilation fails because `Timeline` does not accept `currentUserId`.

- [x] **Step 3: Add the minimal Timeline link branch**

Extend the `Timeline` props and pass the ID to each item:

```tsx
export function Timeline({ items, showSquad = false, currentUserId }: {
  items: FeedItemWithSquad[] | null;
  showSquad?: boolean;
  currentUserId?: number;
}) {
  // existing loading and empty states
  return (
    <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200">
      {items.map((it) => (
        <TimelineItem
          key={it.id}
          item={it}
          showSquad={showSquad}
          currentUserId={currentUserId}
        />
      ))}
    </ul>
  );
}
```

Compute and reuse the actor URL in `TimelineItem`:

```tsx
function TimelineItem({ item, showSquad, currentUserId }: {
  item: FeedItemWithSquad;
  showSquad: boolean;
  currentUserId?: number;
}) {
  const name = item.actor?.displayName ?? "누군가";
  const profileHref = item.actor?.id === currentUserId
    ? "/profile"
    : `/users/${item.actor?.id}`;
  // use profileHref for both existing actor Link elements
}
```

The URL is only used inside existing `item.actor` branches, so an absent actor never renders the fallback `/users/undefined` value.

- [x] **Step 4: Pass the current user ID from both feed pages**

In the main page, retain the already loaded user ID through `Dashboard`:

```tsx
return me ? <Dashboard currentUserId={me.id} /> : <Landing />;

function Dashboard({ currentUserId }: { currentUserId: number }) {
  // existing state and loading
  return <Timeline items={visibleFeed} showSquad currentUserId={currentUserId} />;
}
```

In the squad page, use its existing `me` state:

```tsx
<Timeline items={items} currentUserId={me?.id} />
```

- [x] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
cd frontend
npx tsx --test src/app/components/Timeline.test.tsx
```

Expected: 4 tests pass and 0 fail.

- [x] **Step 6: Run frontend regression verification**

Run:

```bash
cd frontend
npx tsx --test 'src/**/*.test.ts' 'src/**/*.test.tsx' 'src/**/*.test.mjs'
npm run build
```

Expected: all discovered tests pass and the Next.js production build succeeds.

- [x] **Step 7: Commit the implementation**

```bash
git add frontend/src/app/components/Timeline.test.tsx frontend/src/app/components/Timeline.tsx frontend/src/app/page.tsx 'frontend/src/app/squads/[id]/page.tsx' docs/superpowers/plans/2026-07-17-own-feed-profile-link.md
git commit -m "fix(profile): route own feed links to my profile"
```
