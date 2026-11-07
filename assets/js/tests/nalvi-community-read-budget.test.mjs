import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../nalvi-community-service.js", import.meta.url), "utf8");

function createHarness() {
  const calls = { counts: 0, commentLists: 0, profileWrites: 0 };
  const currentUser = {
    uid: "user-1",
    isAnonymous: false,
    displayName: "Alicia",
    photoURL: "https://example.com/alicia.jpg"
  };
  const pathOf = value => value?.path || "root";
  const makeReference = path => ({ path });
  const postReference = makeReference("communityPosts/post-1");
  const postSnapshot = {
    id: "post-1",
    ref: postReference,
    data: () => ({
      authorId: "user-1",
      authorName: "Alicia",
      body: "Mba'éichapa",
      category: "community",
      createdAt: { toDate: () => new Date("2026-11-06T12:00:00Z") }
    })
  };
  const firebase = {
    auth: { currentUser },
    db: makeReference("db"),
    collection: (parent, ...segments) => makeReference([pathOf(parent), ...segments].join("/")),
    doc: (parent, ...segments) => makeReference([pathOf(parent), ...segments].join("/")),
    query: reference => reference,
    orderBy: () => ({}),
    limit: () => ({}),
    serverTimestamp: () => ({ server: true }),
    getDoc: async reference => {
      if (reference.path === "db/communityProfiles/user-1") {
        return {
          exists: () => true,
          data: () => ({
            userId: "user-1",
            displayName: "Alicia",
            photoURL: "https://example.com/alicia.jpg",
            bio: ""
          })
        };
      }
      return { exists: () => false, data: () => ({}) };
    },
    setDoc: async reference => {
      if (reference.path === "db/communityProfiles/user-1") calls.profileWrites += 1;
    },
    getCountFromServer: async () => {
      calls.counts += 1;
      return { data: () => ({ count: 1 }) };
    },
    getDocs: async () => {
      calls.commentLists += 1;
      return { docs: [] };
    },
    onSnapshot: (reference, onValue) => {
      if (reference.path === "db/communityPosts") queueMicrotask(() => onValue({ docs: [postSnapshot] }));
      else queueMicrotask(() => onValue({ docs: [] }));
      return () => {};
    }
  };
  const window = {
    GCA_FEATURES: { communityWrites: true },
    GCA_FIREBASE_LIVE: firebase
  };
  const context = vm.createContext({
    window,
    document: { documentElement: { lang: "es" } },
    console,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    Promise,
    Map,
    Set,
    Date,
    Intl
  });
  vm.runInContext(source, context, { filename: "nalvi-community-service.js" });
  return { calls, service: window.NALVI_COMMUNITY_SERVICE };
}

function firstFeed(service) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("COMMUNITY_TEST_TIMEOUT")), 1000);
    service.subscribePosts(posts => {
      clearTimeout(timer);
      resolve(posts);
    }, reject);
  });
}

test("reuses recent post and profile hydration instead of multiplying Firestore aggregations", async () => {
  const { calls, service } = createHarness();

  const first = await firstFeed(service);
  const countsAfterFirstFeed = calls.counts;
  const commentListsAfterFirstFeed = calls.commentLists;
  const second = await firstFeed(service);

  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(countsAfterFirstFeed, 4, "three post counts and one follower count are enough");
  assert.equal(calls.counts, countsAfterFirstFeed, "a repeated subscription must reuse cached counts");
  assert.equal(calls.commentLists, commentListsAfterFirstFeed, "comments must not be fetched again");
  assert.equal(calls.profileWrites, 0, "an unchanged profile must not be rewritten on every connection");
});
