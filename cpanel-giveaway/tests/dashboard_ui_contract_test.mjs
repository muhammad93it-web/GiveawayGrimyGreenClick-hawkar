import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

class Element {
  constructor(tagName = "div", id = "") {
    this.tagName = tagName;
    this.id = id;
    this.textContent = "";
    this.className = "";
    this.value = "";
    this.disabled = false;
    this.children = [];
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
    };
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  add(child) {
    this.children.push(child);
  }

  addEventListener() {}

  remove() {
    this.removed = true;
  }
}

class OptionElement extends Element {
  constructor(text = "", value = "") {
    super("option");
    this.textContent = text;
    this.value = value;
  }
}

const giveawayFixture = {
  exists: true,
  id: "giveaway-fixture",
  status: "running",
  assetId: "page-1",
  postId: "post-1",
  postPlatform: "facebook",
  prizeCount: 2,
  prizeTitle: "خەڵاتی تاقیکردنەوە",
  totalComments: 5,
  totalParticipants: 1,
  participantsCount: 1,
  commentsWithIdentity: 2,
  commentsWithoutIdentity: 3,
  pagesFetched: 2,
  importStatus: "running",
  lastImportError: null,
  includeReplies: true,
  lastSyncedAt: "2026-08-23T12:05:00+00:00",
  lastError: null,
  commentImport: {
    status: "running",
    phase: "top_level",
    pageCount: 2,
    fetchedComments: 5,
    startedAt: "2026-08-23T12:04:00+00:00",
    completedAt: null,
    lastError: null,
    completionRequested: false,
    migrationRequired: false,
  },
  identityCoverage: {
    identifiedComments: 2,
    anonymousComments: 3,
    identifiedParticipants: 1,
    anonymousEntries: 3,
  },
  participants: [
    {
      participantKey: "identified-fixture",
      displayName: "بەشداربووی ناسنامەدار",
      profilePictureUrl: null,
      commentCount: 2,
      rank: 1,
      identityAvailable: true,
    },
    {
      participantKey: "anonymous-named-fixture",
      displayName: "ناوی گەڕاوەوە بەبێ ناسنامە",
      profilePictureUrl: null,
      commentCount: 1,
      rank: 2,
      identityAvailable: false,
    },
    {
      participantKey: "anonymous-fixture-2",
      displayName: "بێ ناو",
      profilePictureUrl: null,
      commentCount: 1,
      rank: 3,
      identityAvailable: false,
    },
    {
      participantKey: "anonymous-fixture-3",
      displayName: "بێ ناو",
      profilePictureUrl: null,
      commentCount: 1,
      rank: 4,
      identityAvailable: false,
    },
  ],
};

const apiResponse = url => {
  if (url === "/api/meta/status") {
    return {
      configured: true,
      connected: true,
      csrfToken: "fixture-token",
      adminName: "بەڕێوەبەری تاقیکردنەوە",
      tokenStatus: "active",
      callbackUrl: "https://giveaway.example.com/api/meta/callback",
    };
  }
  if (url === "/api/meta/assets") {
    return [{ id: "page-1", name: "پەیجی تاقیکردنەوە", platform: "facebook" }];
  }
  if (url === "/api/meta/permissions") {
    return {
      requested: ["pages_show_list", "pages_read_engagement", "pages_read_user_content"],
      granted: ["pages_show_list", "pages_read_engagement", "pages_read_user_content"],
      declined: [],
      expired: [],
      pageCommentAccess: "granted",
      businessAssetUserProfileAccess: "requires_meta_app_review",
      historicalCommentSample: {
        commentReturned: true,
        fromPresent: false,
        fromIdPresent: false,
        fromNamePresent: false,
      },
    };
  }
  if (url.includes("/posts")) {
    return [{ id: "post-1", message: "پۆستی تاقیکردنەوە", createdAt: "2026-08-23T12:00:00+00:00" }];
  }
  if (url === "/api/giveaways/current") {
    return giveawayFixture;
  }
  if (url === "/api/giveaways/current/recent-comments") {
    return [{
      displayName: "بەشداربووی ناسنامەدار",
      profilePictureUrl: null,
      message: "A real comment returned by the Page",
      commentedAt: "2026-08-23T12:00:00+00:00",
    }];
  }
  throw new Error(`Unexpected fixture request: ${url}`);
};

const createContext = (ids, url = "https://giveaway.example.com/", language = "ckb") => {
  const elements = Object.fromEntries(ids.map(id => [id, new Element("div", id)]));
  const browserUrl = new URL(url);
  const location = {
    href: browserUrl.href,
    search: browserUrl.search,
  };
  const history = {
    replaceState: (_state, _title, nextUrl) => {
      location.href = new URL(nextUrl, location.href).href;
      location.search = new URL(location.href).search;
    },
  };
  const document = {
    hidden: false,
    documentElement: { lang: language },
    getElementById: id => elements[id] ?? (elements[id] = new Element("div", id)),
    createElement: tagName => new Element(tagName),
  };
  const context = vm.createContext({
    console,
    Date,
    document,
    Option: OptionElement,
    URL,
    URLSearchParams,
    history,
    confirm: () => true,
    location,
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout,
    fetch: async url => ({
      ok: true,
      json: async () => structuredClone(apiResponse(url)),
    }),
  });
  return { context, elements, location };
};

const settle = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};

const dashboardIds = [
  "notice", "setup-card", "app-card", "callback", "admin-name", "asset", "post",
  "prize-title", "prize-count", "include-replies", "status", "totals", "participants",
  "review-context", "identity-note", "import-note", "recent-comments", "sync-note", "permissions-note", "save", "change",
  "start", "pause", "complete", "sync", "disconnect", "refresh-token", "check-permissions",
];
const dashboard = createContext(dashboardIds);
vm.runInContext(
  fs.readFileSync(new URL("../public/assets/dashboard.js", import.meta.url), "utf8"),
  dashboard.context,
);
await settle();

assert.match(dashboard.elements.totals.textContent, /5 کۆمێنت/);
assert.match(dashboard.elements.totals.textContent, /1 بەشداربوو/);
assert.doesNotMatch(dashboard.elements.totals.textContent, /ناسنامە/);
assert.match(dashboard.elements["identity-note"].textContent, /ناسنامەی 3 کۆمێنتی نەداوە/);
assert.match(dashboard.elements["import-note"].textContent, /2 پەڕە پشکنراوە/);
assert.equal(dashboard.elements.participants.children.length, 1);
assert.equal(dashboard.elements.participants.children[0].children[3].textContent, 2);
assert.equal(dashboard.elements.participants.children[0].children[2].textContent, "بەشداربووی ناسنامەدار");
assert.equal(dashboard.elements["recent-comments"].children[0].children[1].children[1].textContent, "A real comment returned by the Page");

const expiredLogin = createContext(dashboardIds, "https://giveaway.example.com/?meta=expired_state");
vm.runInContext(
  fs.readFileSync(new URL("../public/assets/dashboard.js", import.meta.url), "utf8"),
  expiredLogin.context,
);
await settle();
assert.match(expiredLogin.elements.notice.textContent, /کاتی پشتڕاستکردنەوە تەواو بوو/);
assert.equal(expiredLogin.location.search, "");

const reviewerDashboard = createContext(dashboardIds, "https://giveaway.example.com/", "en");
vm.runInContext(
  fs.readFileSync(new URL("../public/assets/dashboard.js", import.meta.url), "utf8"),
  reviewerDashboard.context,
);
await settle();
assert.match(reviewerDashboard.elements["review-context"].textContent, /Facebook Page: پەیجی تاقیکردنەوە \(page-1\)/);
assert.match(reviewerDashboard.elements.totals.textContent, /5 comments · 1 participants/);
assert.equal(reviewerDashboard.elements.participants.children[0].children[2].textContent, "بەشداربووی ناسنامەدار");

const liveIds = [
  "live-prize", "live-status", "live-totals", "podium",
  "live-participants",
];
const live = createContext(liveIds);
vm.runInContext(
  fs.readFileSync(new URL("../public/assets/live.js", import.meta.url), "utf8"),
  live.context,
);
await settle();

assert.match(live.elements["live-totals"].textContent, /5 کۆی کۆمێنتەکان/);
assert.match(live.elements["live-totals"].textContent, /2 براوە/);
assert.doesNotMatch(live.elements["live-totals"].textContent, /ناسنامە/);
assert.equal(live.elements.podium.children.length, 1);
assert.equal(live.elements.podium.children[0].children[1].textContent, "بەشداربووی ناسنامەدار · 2 کۆمێنت");

giveawayFixture.identityCoverage = {
  identifiedComments: 0,
  anonymousComments: 5,
  identifiedParticipants: 0,
  anonymousEntries: 5,
};
giveawayFixture.participants = giveawayFixture.participants.filter(participant => !participant.identityAvailable);
const anonymousLive = createContext(liveIds);
vm.runInContext(
  fs.readFileSync(new URL("../public/assets/live.js", import.meta.url), "utf8"),
  anonymousLive.context,
);
await settle();

assert.equal(anonymousLive.elements.podium.children.length, 0);
assert.equal(anonymousLive.elements["live-participants"].children.length, 1);
assert.match(
  anonymousLive.elements["live-participants"].children[0].textContent,
  /هێشتا بەشداربوویەک بۆ پیشاندان نییە/,
);

console.log("dashboard and live UI contract tests passed");
