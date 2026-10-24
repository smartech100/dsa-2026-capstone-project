# AI log

## Build 2: Search, sorting, backlog, first tests

### 1. What I asked

I gave the AI tool the Build 2 prompt from `docs/build-2.md`, along with `README.md`, `docs/user-stories.md`, `docs/build-2.md` and `src/domain/`. I made two changes before using it:

- **Gambian details.** Events are "Banjul Tech Meet" and "Serekunda Jazz Night" in the cities Banjul and Serekunda. Money is the Gambian dalasi (D), stored as whole bututs (100 bututs = D1). I changed "500000 kobo" to "50000 bututs (D500)".
- **S04 criteria.** I added our three class criteria for publish, unpublish and visibility, and fixed the spelling.

The prompt asked for:
1. `mergeSort(items, compare)` with no `Array.prototype.sort`; it must be stable, return a new array and not touch the input.
2. `publishEvent` and `listEventSummaries` in `inventory.js`.
3. `filterEvents`, `sortEvents` and `searchEvents` as pure functions in `eventSearch.js`.
4. Tests for every acceptance criterion in S02 to S06, plus original-list-unchanged, stability, empty list and every error code.
5. An `npm test` script.

### 2. What came back

- `src/domain/sorting.js`: top-down merge sort.
- `src/domain/eventSearch.js`: `filterEvents`, `sortEvents`, `searchEvents`.
- `src/domain/dates.js`: an ISO date parser I did not ask for, used by three files.
- `src/domain/inventory.js`: added `publishEvent`, `unpublishEvent`, `listEventSummaries`, `tierSeatsLeft` and a draft/published status. `createEvent` was extended.
- `test/sorting.test.js`, `test/inventory.test.js`, `test/eventSearch.test.js`: 46 tests.
- `package.json` with `"test": "node --test"`.

First run: `npm test` passed 46 of 46. A search of `src/` found no `.sort(` calls.

### 3. What was wrong or unclear

Passing tests only show that the code matches the tests the AI wrote. I found these problems or gaps by reading the code against the stories.

1. **Build 1 and the stories disagree.** Build 1 `createEvent` took `{ name, capacity }` and had no city, venue, date or status. The AI kept the old call style working and added the new fields. It also made event capacity optional, because S02 never gives one.
2. **Booking status.** S06 says "pending booking", but Build 1 creates `CONFIRMED` bookings. The AI kept `CONFIRMED` and the S06 test does not check the status. This criterion is **not fully tested**.
3. **Booking an unpublished event.** S06 says "a published event", but `bookTickets` does not check this. Adding the check would break the Build 1 demo.
4. **Unpublish was missing from the prompt.** The prompt only asked for `publishEvent`, but S04 needs unpublish. The AI added `unpublishEvent`.
5. **Required fields.** The AI made title, city and date required and venue optional. S02 only lists title, city and date as failing.
6. **Same-day sorting.** S05 says same-day events "stay in title order". The AI sorts by full timestamp, so a 9 AM event comes before a 5 PM event on the same day, and title only breaks exact ties.
7. **Time zones.** A time with no offset is read as UTC. This is fine for the Gambia, which is on GMT all year.
8. **Publishing twice** does nothing and raises no error. The prompt does not say what should happen.
9. **Unpublish status.** Unpublishing sets the status back to `DRAFT`. The class criteria call it "unpublished".
10. **The `ID_GENERATION_FAILED` test is artificial.** It replaces `bookingsByReference` with a Map that always says "taken".
11. **`package.json`.** The AI never saw my real `package.json`, so I must merge only the `test` line into it.
12. **The file-naming mix-up.**  (eventSearch.test.js in the wrong folder),
### 4. What I checked and changed

- **Stability check.** I changed `<= 0` to `< 0` in `merge`. The test "mergeSort is stable" failed (45 pass, 1 fail). I restored the line and all 46 pass again. Only the direct stability test caught it. The `eventSearch` tests did not, because title and id tie-breaks hide the problem.
- **Build 1 compatibility.** I ran a Build 1 flow (create an event with `{ name, capacity }`, add a tier, book 2). It still works.
- **Money.** I changed the error message in `addTier` to say bututs, and added a comment at the top of `inventory.js`. I kept the name `priceCents` because it means "smallest unit" and renaming it would touch Build 1 code.
- **Decisions I still own:** points 2, 3, 5, 6, 8 and 9 above. I can change any of them in a later build.

### 5. Before I submit (my own checks)

- [ ] I read `mergeSort` and can explain why `<= 0` makes it stable.
- [ ] I ran `npm run demo` and `npm run benchmark` and they still work.
- [ ] I merged the `test` script into my real `package.json`.
- [ ] I searched `src/` and `scripts/` for old names: `grep -rniE "butu|banjul|serekunda|Dalasis" src scripts`.
- [ ] I opened the pull request from `build-2` into `main`.
