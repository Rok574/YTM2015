var __ytm15Backend = null;

  var DBG_LOG = [];
  function dbg(step, a, b) {
    DBG_LOG.push(step + (a !== undefined ? "|" + a : "") + (b !== undefined ? "|" + b : ""));
  }

(function () {
  "use strict";

  var DEFAULT_INVIDIOUS = "https://y.com.sb/";

  var ROSTER = [
    { url: "https://y.com.sb" },
    { url: "https://inv.nadeko.net" },
    { url: "https://inv.tux.pizza" },
    { url: "https://invidious.f5.si" }
  ];

  var PIPED_ROOTS = [
    "https://api.piped.private.coffee",
    "https://pipedapi.kavin.rocks"
  ];

  var INV_CHAIN = ROSTER.map(function (r) { return r.url; });
  var WATCH_CHAIN = [].concat(PIPED_ROOTS, INV_CHAIN);

  function isPipedHost(host) {
    var t = pipedTestBase();
    if (t && host === t) { return true; }
    for (var i = 0; i < PIPED_ROOTS.length; i++) {
      if (host === PIPED_ROOTS[i]) { return true; }
    }
    return false;
  }

  function pipedTestBase() {
    var tb = (typeof window !== "undefined" && window.__ytm15TestPiped) ? window.__ytm15TestPiped : null;
    return tb ? baseOrigin(tb) : null;
  }

  function localWatchChain() {
    var t = pipedTestBase();
    return t ? [t].concat(PIPED_ROOTS, INV_CHAIN) : WATCH_CHAIN;
  }

  function chainStartFor(cls) {
    if (cls.kind === "rapidWatch" || cls.kind === "rapidDl") { return 1; }
    var ri = rosterIndex(cls.base);
    if (ri === -1) { return 0; }
    return ri + 1;
  }

  var RAPID_HOST = "yt-api.p.rapidapi.com";

  var LEGACY_INSTANCES = ["yt.omada.cafe", "allorigins.win"];

  function baseOrigin(value) {
    var re = /(https?:\/\/[^\/\s]+)/g;
    var m, last = null;
    if (value) {
      while ((m = re.exec(value))) { last = m[1]; }
    }
    if (!last) { return ROSTER[0].url; }
    return last;
  }

  function currentBase() {
    var tb = (typeof window !== "undefined" && window.__ytm15TestBase) ? window.__ytm15TestBase : null;
    if (tb) { return baseOrigin(tb); }
    var v = (typeof APP_CUSTOM_INVIDIOUS_URL_expflag !== "undefined") ? APP_CUSTOM_INVIDIOUS_URL_expflag : DEFAULT_INVIDIOUS;
    return baseOrigin(v);
  }

  function rosterIndex(url) {
    var base = baseOrigin(url);
    for (var i = 0; i < ROSTER.length; i++) {
      if (ROSTER[i].url === base) { return i; }
    }
    return -1;
  }

  function customUrl() {
    if (typeof APP_CUSTOM_INVIDIOUS_URL_expflag !== "undefined" && APP_CUSTOM_INVIDIOUS_URL_expflag) { return APP_CUSTOM_INVIDIOUS_URL_expflag; }
    var v = null;
    try { v = localStorage.getItem("APP_CUSTOM_INVIDIOUS_URL"); } catch (e) {}
    if (v) { return v; }
    return DEFAULT_INVIDIOUS;
  }

  function migrateInstance() {
    var v;
    try { v = localStorage.getItem("APP_CUSTOM_INVIDIOUS_URL"); } catch (e) { return; }
    if (v !== null && v !== undefined) {
      for (var i = 0; i < LEGACY_INSTANCES.length; i++) {
        if (v.indexOf(LEGACY_INSTANCES[i]) !== -1) {
          try {
            localStorage.setItem("APP_CUSTOM_INVIDIOUS_URL", DEFAULT_INVIDIOUS);
            APP_CUSTOM_INVIDIOUS_URL_expflag = DEFAULT_INVIDIOUS;
            if (typeof APIbaseURL !== "undefined") { APIbaseURL = DEFAULT_INVIDIOUS; }
          } catch (e) {}
          break;
        }
      }
    }
  }
  migrateInstance();

  function normThumbs(src, forceRel, minCount) {
    if (!Array.isArray(src)) { src = []; }
    var out = [];
    for (var i = 0; i < src.length; i++) {
      var t = src[i];
      var u = (t && t.url) ? t.url : "";
      if (u && forceRel && u.indexOf("https://") === 0) { u = u.slice("https:".length); }
      out.push({ url: u, width: (t && t.width) || 0, height: (t && t.height) || 0 });
    }
    if (!out.length) { out.push({ url: "", width: 0, height: 0 }); }
    while (out.length < (minCount || 1)) { out.push({ url: out[out.length - 1].url, width: out[out.length - 1].width, height: out[out.length - 1].height }); }
    return out;
  }

  function num(value) {
    if (value === null || value === undefined) { return null; }
    if (typeof value === "number") { return value; }
    var s = String(value);
    var m = s.replace(/[,\s]/g, "").match(/^([\d.]+)\s*([kKmMbB])?.*/);
    if (!m) { return null; }
    var n = parseFloat(m[1]);
    if (isNaN(n)) { return null; }
    var unit = m[2];
    if (!unit) { return Math.round(n); }
    var mult = { k: 1e3, m: 1e6, b: 1e9 }[unit.toLowerCase()];
    return Math.round(n * mult);
  }

  function isoTime(secs) {
    if (secs === null || secs === undefined || isNaN(secs)) { return ""; }
    return new Date(secs * 1000).toISOString();
  }

  function absUrl(base, url) {
    if (!url) { return ""; }
    if (/^https?:\/\//i.test(url)) { return url; }
    if (url.indexOf("/") === 0) { return base + url; }
    return url;
  }

  function mapVideo(v, dtype) {
    return {
      type: dtype,
      title: v.title || "",
      videoId: v.videoId || "",
      channelTitle: v.author || "",
      channelId: v.authorId || "",
      thumbnail: normThumbs(v.videoThumbnails || v.thumbnail, false, 1),
      lengthText: (v.lengthSeconds !== null && v.lengthSeconds !== undefined) ? String(v.lengthSeconds) : (v.lengthText || "0"),
      publishedTimeText: v.publishedText || "",
      viewCount: (v.viewCount !== null && v.viewCount !== undefined) ? v.viewCount : null,
      liveNow: !!v.liveNow
    };
  }

  function adaptSearch(raw, context) {
    var data = [];
    var err = "Required param missing: query";
    var continuation = "";
    if (context && context.emptyQuery) {
      return { data: [], error: err, continuation: "" };
    }
    if (Array.isArray(raw)) {
      err = null;
      data = [];
      for (var i = 0; i < raw.length; i++) {
        var item = raw[i];
        if (item.type === "channel") {
          data.push({
            type: "channel",
            thumbnail: normThumbs(item.authorThumbnails, true, 2),
            channelTitle: item.author || "",
            subscriberCount: (item.subCount !== null && item.subCount !== undefined) ? item.subCount : null,
            channelId: item.authorId || "",
            viewCount: null,
            publishedTimeText: "",
            lengthText: ""
          });
        } else if (item.type === "playlist") {
          data.push({
            type: "playlist",
            thumbnail: normThumbs(item.videoThumbnails || item.authorThumbnails, false, 1),
            videoCount: item.videoCount || 0,
            title: item.title || "",
            channelTitle: item.author || "",
            playlistId: item.playlistId || item.authorId || "",
            channelId: item.authorId || "",
            viewCount: null,
            publishedTimeText: "",
            lengthText: String(item.videoCount || 0)
          });
        } else if (item.type === "video") {
          data.push({
            type: "video",
            thumbnail: normThumbs(item.videoThumbnails || item.thumbnail, false, 1),
            lengthText: item.lengthText || "0",
            title: item.title || "",
            channelTitle: item.author || "",
            channelId: item.authorId || "",
            videoId: item.videoId || "",
            publishedTimeText: item.publishedText || "",
            viewCount: num(item.viewCountText)
          });
        }
      }
      if (data.length && context && context.pageBase > 0) {
        continuation = String(context.pageBase + 1);
      }
    }
    return { data: data, error: err, continuation: continuation };
  }

  function adaptSearchFinalText(raw, context) {
    return JSON.stringify(adaptSearch(raw, context));
  }

  function adaptChannelVideos(raw, meta) {
    if (!raw || raw.error || !Array.isArray(raw.videos)) {
      return { data: [], continuation: "" };
    }
    var dtype = (meta.tab === "shorts") ? "shorts" : "video";
    var items = [];
    for (var i = 0; i < raw.videos.length; i++) {
      items.push(mapVideo(raw.videos[i], dtype));
    }
    return { data: items, continuation: (raw.continuation && items.length) ? raw.continuation : "" };
  }

  function adaptChannelVideosFinalText(raw, meta) {
    return JSON.stringify(adaptChannelVideos(raw, meta));
  }

  function adaptWatch(raw) {
    var d = {
      title: raw.title || "",
      description: raw.description || "",
      descriptionHtml: raw.descriptionHtml || raw.description || "",
      publishedAt: isoTime(raw.published),
      viewCount: (raw.viewCount !== null && raw.viewCount !== undefined) ? raw.viewCount : 0,
      likeCount: (raw.likeCount !== null && raw.likeCount !== undefined) ? raw.likeCount : 0,
      allowRatings: !!raw.allowRatings,
      isUnlisted: !raw.isListed,
      category: raw.genre || "",
      channelTitle: raw.author || "",
      channelId: raw.authorId || "",
      channelThumbnail: normThumbs(raw.authorThumbnails, false, 3),
      subscriberCountText: raw.subCountText || ((raw.subCount !== null && raw.subCount !== undefined) ? Number(raw.subCount).toLocaleString() + " subscribers" : ""),
      relatedVideos: { data: [] }
    };
    var rel = (raw.recommendedVideos && Array.isArray(raw.recommendedVideos)) ? raw.recommendedVideos : [];
    for (var i = 0; i < rel.length; i++) {
      var r = rel[i];
      if (!r || !r.videoId) { continue; }
      d.relatedVideos.data.push({
        type: "video",
        thumbnail: normThumbs(r.videoThumbnails || r.thumbnail, false, 2),
        lengthText: (r.lengthSeconds !== null && r.lengthSeconds !== undefined) ? String(r.lengthSeconds) : "0",
        title: r.title || "",
        channelTitle: r.author || "",
        channelId: r.authorId || "",
        videoId: r.videoId,
        viewCount: num(r.viewCountText)
      });
    }
    if (!d.relatedVideos.data.length) { d.relatedVideos.data = [{ type: "video", videoId: "" }]; }
    return d;
  }

  function adaptWatchFinalText(raw) {
    return JSON.stringify(adaptWatch(raw));
  }

  function adaptDl(raw, base) {
    var d = {
      title: raw.title || "",
      thumbnail: normThumbs(raw.videoThumbnails, false, 4),
      formats: [],
      captions: { captionTracks: [] }
    };
    var fs = (raw.formatStreams && Array.isArray(raw.formatStreams)) ? raw.formatStreams : [];
    for (var i = 0; i < fs.length; i++) {
      var f = fs[i];
      if (!f || !f.url) { continue; }
      d.formats.push({
        url: f.url,
        mimeType: f.type || (f.contentType || ""),
        qualityLabel: f.qualityLabel || f.quality || ""
      });
    }
    var caps = (raw.captions && Array.isArray(raw.captions)) ? raw.captions : [];
    for (var j = 0; j < caps.length; j++) {
      var c = caps[j];
      if (!c) { continue; }
      d.captions.captionTracks.push({
        baseUrl: absUrl(base, c.url),
        languageCode: c.language_code || "",
        name: c.label || ""
      });
    }
    return d;
  }

  function adaptDlFinalText(raw, base) {
    return JSON.stringify(adaptDl(raw, base));
  }

  function pipedVideoId(url) {
    var u = String(url || "");
    var m = u.match(/[?&]v=([\w-]{6,})/);
    return m ? m[1] : (u.match(/\/watch\/([\w-]{6,})/) ? RegExp.$1 : "");
  }

  function pipedChannelId(url) {
    var u = String(url || "");
    var m = u.match(/\/channel\/([\w-]{6,})/);
    return m ? m[1] : "";
  }

  function adaptWatchPiped(raw) {
    var d = {
      title: raw.title || "",
      description: raw.description || "",
      descriptionHtml: raw.description || "",
      publishedAt: raw.uploadDate || "",
      viewCount: (raw.views !== null && raw.views !== undefined) ? raw.views : 0,
      likeCount: (raw.likes !== null && raw.likes !== undefined) ? raw.likes : 0,
      allowRatings: true,
      isUnlisted: false,
      category: raw.category || "",
      channelTitle: raw.uploader || "",
      channelId: pipedChannelId(raw.uploaderUrl),
      channelThumbnail: normThumbs([{ url: raw.uploaderAvatar || "" }], false, 3),
      subscriberCountText: (raw.uploaderSubscriberCount !== null && raw.uploaderSubscriberCount !== undefined) ? Number(raw.uploaderSubscriberCount).toLocaleString() + " subscribers" : "",
      relatedVideos: { data: [] }
    };
    var rel = (raw.relatedStreams && Array.isArray(raw.relatedStreams)) ? raw.relatedStreams : [];
    for (var i = 0; i < rel.length; i++) {
      var r = rel[i];
      if (!r || r.type !== "stream") { continue; }
      var vid = pipedVideoId(r.url);
      if (!vid) { continue; }
      d.relatedVideos.data.push({
        type: "video",
        thumbnail: normThumbs([{ url: r.thumbnail || "" }], false, 2),
        lengthText: (r.duration !== null && r.duration !== undefined) ? String(r.duration) : "0",
        title: r.title || "",
        channelTitle: r.uploaderName || "",
        channelId: pipedChannelId(r.uploaderUrl),
        videoId: vid,
        viewCount: null
      });
    }
    if (!d.relatedVideos.data.length) { d.relatedVideos.data = [{ type: "video", videoId: "" }]; }
    return d;
  }

  function adaptWatchPipedFinalText(raw) {
    return JSON.stringify(adaptWatchPiped(raw));
  }

  function adaptDlPiped(raw) {
    var d = {
      title: raw.title || "",
      thumbnail: normThumbs([{ url: raw.thumbnailUrl || "" }], false, 4),
      formats: [],
      captions: { captionTracks: [] }
    };
    function pushStreams(arr) {
      if (!Array.isArray(arr)) { return; }
      for (var i = 0; i < arr.length; i++) {
        var f = arr[i];
        if (!f || !f.url) { continue; }
        d.formats.push({
          url: f.url,
          mimeType: f.mimeType || String(f.format || ""),
          qualityLabel: f.quality || ""
        });
      }
    }
    pushStreams(raw.videoStreams);
    pushStreams(raw.audioStreams);
    var caps = (raw.subtitles && Array.isArray(raw.subtitles)) ? raw.subtitles : [];
    for (var j = 0; j < caps.length; j++) {
      var c = caps[j];
      if (!c || !c.url) { continue; }
      d.captions.captionTracks.push({
        baseUrl: c.url,
        languageCode: c.code || "",
        name: c.name || ""
      });
    }
    return d;
  }

  function adaptDlPipedFinalText(raw) {
    return JSON.stringify(adaptDlPiped(raw));
  }

  var CHANNEL_TAB_ALLOWED = ["home", "videos", "shorts", "streams", "playlists"];

  function adaptChannelHome(raw) {
    var tabs = [];
    if (Array.isArray(raw.tabs)) {
      for (var i = 0; i < raw.tabs.length; i++) {
        var t = String(raw.tabs[i]).toLowerCase();
        if (t === "live") { t = "streams"; }
        if (CHANNEL_TAB_ALLOWED.indexOf(t) !== -1 && tabs.indexOf(t) === -1) {
          tabs.push(t);
        }
      }
    }
    return {
      subCount: (raw.subCount !== null && raw.subCount !== undefined) ? raw.subCount : 0,
      meta: {
        channelId: raw.authorId || "",
        title: raw.author || "",
        description: raw.description || "",
        banner: (raw.authorBanners && raw.authorBanners.length) ? normThumbs(raw.authorBanners, false, 2) : null,
        avatar: normThumbs(raw.authorThumbnails, false, 3),
        subscriberCount: (raw.subCount !== null && raw.subCount !== undefined) ? raw.subCount : null,
        tabs: tabs
      },
      data: { items: [] }
    };
  }

  function adaptChannelHomeFinalText(raw) {
    return JSON.stringify(adaptChannelHome(raw));
  }

  function adaptChannelAbout(raw) {
    return {
      joinedDate: isoTime(raw.joined),
      links: [],
      viewCount: (raw.totalViews !== null && raw.totalViews !== undefined) ? raw.totalViews : 0,
      videosCount: (raw.videoCount !== null && raw.videoCount !== undefined) ? raw.videoCount : null,
      author: raw.author || "",
      description: raw.description || ""
    };
  }

  function adaptChannelAboutFinalText(raw) {
    return JSON.stringify(adaptChannelAbout(raw));
  }

  function ytClassify(urlStr) {
    var u;
    try { u = new URL(urlStr, "https://y.com.sb"); } catch (e) { return null; }
    if (u.hostname === RAPID_HOST) {
      var base = currentBase();
      var sp = u.searchParams;
      var path = u.pathname;
      var meta = null;
      if (path === "/search") {
        var q = sp.get("query") || "";
        var pageRaw = sp.get("page") || sp.get("token");
        var page = 1;
        if (pageRaw) {
          var n = parseInt(pageRaw, 10);
          if (!isNaN(n)) { page = n; }
        }
        var target = new URL(base);
        target.pathname = "/api/v1/search";
        if (q) { target.searchParams.set("q", q); }
        target.searchParams.set("page", String(page));
        if (sp.get("sort_by")) { target.searchParams.set("sort_by", sp.get("sort_by")); }
        if (sp.get("upload_date")) { target.searchParams.set("date", sp.get("upload_date")); }
        if (sp.get("duration")) { target.searchParams.set("duration", sp.get("duration")); }
        if (sp.get("type")) { target.searchParams.set("type", sp.get("type")); }
        if (sp.get("features")) { target.searchParams.set("features", sp.get("features")); }
        meta = { kind: "rapidSearch", pageBase: page, tab: null, emptyQuery: !q };
        return { kind: "rapidSearch", mappedUrl: target.href, meta: meta, base: base };
      } else if (path === "/video/info") {
        meta = { kind: "rapidWatch", tab: null };
        var id1 = sp.get("id") || "";
        meta.vid = id1;
        meta.provider = "piped";
        var pbase1 = pipedTestBase() || PIPED_ROOTS[0];
        return { kind: "rapidWatch", mappedUrl: pbase1 + "/streams/" + encodeURIComponent(id1), meta: meta, base: base, provider: "piped" };
      } else if (path === "/dl") {
        meta = { kind: "rapidDl", tab: null };
        var id2 = sp.get("id") || "";
        meta.vid = id2;
        meta.provider = "piped";
        var pbase2 = pipedTestBase() || PIPED_ROOTS[0];
        return { kind: "rapidDl", mappedUrl: pbase2 + "/streams/" + encodeURIComponent(id2), meta: meta, base: base, provider: "piped" };
      } else if (path === "/channel/home") {
        meta = { kind: "rapidChannelHome", tab: null };
        var id3 = sp.get("id") || "";
        return { kind: "rapidChannelHome", mappedUrl: base + "/api/v1/channels/" + encodeURIComponent(id3), meta: meta, base: base };
      } else if (path === "/channel/about") {
        meta = { kind: "rapidChannelAbout", tab: null };
        var id4 = sp.get("id") || "";
        return { kind: "rapidChannelAbout", mappedUrl: base + "/api/v1/channels/" + encodeURIComponent(id4), meta: meta, base: base };
      } else if (path === "/channel/videos" || path === "/channel/shorts" || path === "/channel/liveStreams") {
        var tab = path === "/channel/shorts" ? "shorts" : (path === "/channel/liveStreams" ? "streams" : "videos");
        var cid = sp.get("id") || "";
        var turl = new URL(base);
        turl.pathname = "/api/v1/channels/" + encodeURIComponent(cid) + "/" + tab;
        if (sp.get("sort_by")) { turl.searchParams.set("sort_by", sp.get("sort_by")); }
        if (sp.get("token")) { turl.searchParams.set("continuation", sp.get("token")); }
        meta = { kind: "rapidChannelVideos", tab: tab };
        return { kind: "rapidChannelVideos", mappedUrl: turl.href, meta: meta, base: base };
      }
      return null;
    }
    if (u.pathname.indexOf("/api/v1/") === 0) {
      return { kind: "invidious", mappedUrl: urlStr, meta: null, base: baseOrigin(urlStr) };
    }
    return null;
  }

  function finalTextFor(meta, base, raw, provider) {
    var text = raw;
    var isPiped = (provider === "piped");
    if (meta && meta.kind === "rapidSearch") {
      try { text = adaptSearchFinalText(JSON.parse(raw), meta); } catch (e) { return null; }
    } else if (meta && meta.kind === "rapidChannelVideos") {
      try {
        var j = JSON.parse(raw);
        if (meta.tab !== "streams" && (j.error || !Array.isArray(j.videos))) { return null; }
        text = adaptChannelVideosFinalText(j, meta);
      } catch (e) { return null; }
    } else if (meta && meta.kind === "rapidWatch") {
      try {
        var j2 = JSON.parse(raw);
        if (j2.error) { text = raw; } else { text = isPiped ? adaptWatchPipedFinalText(j2) : adaptWatchFinalText(j2); }
      } catch (e) { return null; }
    } else if (meta && meta.kind === "rapidDl") {
      try {
        var j3 = JSON.parse(raw);
        if (j3.error) { text = raw; } else { text = isPiped ? adaptDlPipedFinalText(j3) : adaptDlFinalText(j3, base); }
      } catch (e) { return null; }
    } else if (meta && meta.kind === "rapidChannelHome") {
      try {
        var j4 = JSON.parse(raw);
        if (j4.error) { return null; }
        text = adaptChannelHomeFinalText(j4);
      } catch (e) { return null; }
    } else if (meta && meta.kind === "rapidChannelAbout") {
      try {
        var j5 = JSON.parse(raw);
        if (j5.error) { return null; }
        text = adaptChannelAboutFinalText(j5);
      } catch (e) { return null; }
    }
    return text;
  }

  function isJSONish(raw) {
    var s = String(raw || "").replace(/^\s+/, "");
    if (s.length === 0) { return false; }
    return s.charAt(0) === "{" || s.charAt(0) === "[";
  }

  if (typeof XMLHttpRequest !== "undefined") {
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    var origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    var protoResponse = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "response");
    var protoResponseText = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "responseText");
    var rawResponse = function (x) { return (protoResponse && protoResponse.get) ? protoResponse.get.call(x) : undefined; };
    var rawResponseText = function (x) { return (protoResponseText && protoResponseText.get) ? protoResponseText.get.call(x) : undefined; };

    XMLHttpRequest.prototype.open = function (method, url, async, user, pass) {
      if (this.__ytm15Retrying) {
        this.__ytm15Retrying = false;
        return origOpen.call(this, method, url, async, user, pass);
      }
      var cls = ytClassify(url);
      if (cls) {
        var st = this.__ytm15 = {
          classify: cls,
          headers: {},
          attempts: 0,
          done: false,
          finalText: null,
          appOnload: null,
          appOnerror: null,
          aborted: false,
          provider: cls.provider || "inv",
          chainIdx: chainStartFor(cls)
        };
        var self = this;
        try {
          var h0 = self.onload;
          var e0 = self.onerror;
          if (typeof h0 === "function" && self.__ytm15) { self.__ytm15.appOnload = h0; self.onload = null; }
          if (typeof e0 === "function" && self.__ytm15) { self.__ytm15.appOnerror = e0; self.onerror = null; }
          Object.defineProperty(this, "onload", { configurable: true, get: function () { return self.__ytm15 ? self.__ytm15.appOnload : null; }, set: function (f) { if (self.__ytm15) { self.__ytm15.appOnload = f; } } });
          Object.defineProperty(this, "onerror", { configurable: true, get: function () { return self.__ytm15 ? self.__ytm15.appOnerror : null; }, set: function (f) { if (self.__ytm15) { self.__ytm15.appOnerror = f; } } });
          Object.defineProperty(this, "response", { configurable: true, enumerable: false, get: function () { return self.__ytm15 ? (self.__ytm15.finalText !== null ? self.__ytm15.finalText : rawResponse(self)) : rawResponse(self); } });
          Object.defineProperty(this, "responseText", { configurable: true, enumerable: false, get: function () { return self.__ytm15 ? (self.__ytm15.finalText !== null ? self.__ytm15.finalText : rawResponseText(self)) : rawResponseText(self); } });
        } catch (e) {}
        url = cls.mappedUrl;
        dbg("open", cls.kind, String(url).slice(0, 50));
      } else {
        this.__ytm15 = null;
      }
      this.__ytm15Method = method;
      this.__ytm15URL = url;
      this.__ytm15Async = async;
      this.__ytm15User = user;
      this.__ytm15Pass = pass;
      return origOpen.call(this, method, url, async, user, pass);
    };

    XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
      if (this.__ytm15) {
        this.__ytm15.headers[k] = v;
        if (/^x-rapidapi-/i.test(String(k))) { return undefined; }
      }
      return origSetHeader.call(this, k, v);
    };

    XMLHttpRequest.prototype.send = function (body) {
      var self = this;
      var st = this.__ytm15;
      if (!st) { return origSend.call(this, body); }
      st.body = body;
      st.attempts = 0;
      st.done = false;
      st.finalText = null;
      st.softRetried = false;
      dbg("send", String(self.__ytm15Method || "GET"), String(self.__ytm15URL || "").slice(0, 60));

      function setListeners() {
        self.addEventListener("load", onLoad);
        self.addEventListener("error", onError);
        self.addEventListener("abort", onAbort);
      }
      function clearListeners() {
        self.removeEventListener("load", onLoad);
        self.removeEventListener("error", onError);
        self.removeEventListener("abort", onAbort);
      }

      function rotateIfPossible() {
        if (st.aborted || st.done) { return false; }
        var kind = st.classify ? st.classify.kind : "";
        var chain = (kind === "rapidWatch" || kind === "rapidDl") ? localWatchChain() : INV_CHAIN;
        if (st.chainIdx >= chain.length) { return false; }
        var host = chain[st.chainIdx++];
        var piped = isPipedHost(host);
        var nextUrl;
        if (kind === "rapidWatch" || kind === "rapidDl") {
          var vid = (st.classify.meta && st.classify.meta.vid) || "";
          if (!vid) { return false; }
          nextUrl = piped ? (host + "/streams/" + encodeURIComponent(vid)) : (host + "/api/v1/videos/" + encodeURIComponent(vid));
        } else {
          var u = new URL(st.classify.mappedUrl);
          u.protocol = "https";
          u.host = host.replace(/^https?:\/\//, "");
          nextUrl = u.href;
        }
        var nextBase = host + "/";
        st.classify.base = nextBase;
        st.classify.mappedUrl = nextUrl;
        st.classify.provider = piped ? "piped" : "inv";
        st.provider = piped ? "piped" : "inv";
        st.attempts++;
        dbg(piped ? "piped" : "rotate", host, "attempt#" + st.attempts);
        self.__ytm15Retrying = true;
        origOpen.call(self, self.__ytm15Method, nextUrl, self.__ytm15Async, self.__ytm15User, self.__ytm15Pass);
        for (var k in st.headers) { if (/^x-rapidapi-/i.test(k)) { continue; } origSetHeader.call(self, k, st.headers[k]); }
        setListeners();
        origSend.call(self, st.body);
        return true;
      }

      function makeEvent(type) {
        return { type: type, target: self, currentTarget: self, timeStamp: Date.now(), eventPhase: 2 };
      }

      function onLoad() {
        clearListeners();
        if (st.done || st.aborted) { return; }
        dbg("onload", self.status, String(rawResponseText(self)).slice(0, 30));
        if (self.status === 200) {
          var raw = rawResponseText(self);
          var adapted = raw;
          if (!isJSONish(raw)) {
            if (rotateIfPossible()) { return; }
            st.done = true;
            st.finalText = JSON.stringify({ error: "Server error" });
            if (st.appOnload) { st.appOnload.call(self, makeEvent("load")); }
            return;
          }
          try {
            adapted = finalTextFor(st.classify.meta, st.classify.base, raw, st.classify.provider);
          } catch (e) {
            adapted = null;
          }
          if (adapted === null) {
            if (rotateIfPossible()) { return; }
            st.done = true;
            st.finalText = JSON.stringify({ error: "Server error" });
            if (st.appOnload) { st.appOnload.call(self, makeEvent("load")); }
            return;
          }
          st.done = true;
          st.finalText = adapted;
          dbg("adapted", String(adapted).slice(0, 40));
          persistIfSwitched(st);
          dbg("dispatch", "onload-final", st.classify.kind);
          if (st.appOnload) {
            st.appOnload.call(self, makeEvent("load"));
          }
          return;
        }
        if (self.status === 500 && !st.softRetried && /starting|retry|proxy/i.test(String(rawResponseText(self)))) {
          st.softRetried = true;
          dbg("softretry", self.status);
          setTimeout(function () {
            if (st.aborted || st.done) { return; }
            self.__ytm15Retrying = true;
            origSend.call(self, st.body);
          }, 1200);
          return;
        }
        if (rotateIfPossible()) { return; }
        st.done = true;
        dbg("dispatch", "onload-status-" + self.status, (st.classify ? st.classify.kind : "NOST") + "|" + (self.__ytm15 === st ? "same" : "other"));
        if (st.classify && st.classify.kind !== "invidious") {
          st.finalText = JSON.stringify({ error: (self.statusText || "Server error") });
        }
        if (st.appOnload) { st.appOnload.call(self, makeEvent("load")); }
      }

      function onError() {
        clearListeners();
        if (st.done || st.aborted) { return; }
        dbg("onerror", self.status);
        if (rotateIfPossible()) { return; }
        st.done = true;
        st.finalText = JSON.stringify({ error: "Server error" });
        dbg("dispatch", "onerror", st.classify ? st.classify.kind : "NOST");
        if (st.appOnerror) { st.appOnerror.call(self, makeEvent("error")); }
      }

      function onAbort() {
        clearListeners();
        st.aborted = true;
        st.done = true;
      }

      function persistIfSwitched(st) {
        if (rosterIndex(st.classify.base) === -1) { return; }
        var storedIsDefault = false;
        try {
          var v = localStorage.getItem("APP_CUSTOM_INVIDIOUS_URL");
          storedIsDefault = (v === null || v === DEFAULT_INVIDIOUS || v.indexOf("yt.omada.cafe") !== -1);
        } catch (e) {}
        if (!storedIsDefault) { return; }
        var working = st.classify.base + "/";
        var stored = baseOrigin(customUrl()) + "/";
        if (working === stored) { return; }
        try {
          localStorage.setItem("APP_CUSTOM_INVIDIOUS_URL", working);
          APP_CUSTOM_INVIDIOUS_URL_expflag = working;
          APIbaseURL = working;
        } catch (e) {}
      }

      setListeners();
      origSend.call(this, body);
    };
  }

  var EXPORTS = {
    ROSTER: ROSTER,
    DEFAULT_INVIDIOUS: DEFAULT_INVIDIOUS,
    baseOrigin: baseOrigin,
    currentBase: currentBase,
    rosterIndex: rosterIndex,
    num: num,
    isoTime: isoTime,
    normThumbs: normThumbs,
    mapVideo: mapVideo,
    adaptSearch: adaptSearch,
    adaptChannelVideos: adaptChannelVideos,
    adaptWatch: adaptWatch,
    adaptWatchPiped: adaptWatchPiped,
    adaptDl: adaptDl,
    adaptDlPiped: adaptDlPiped,
    adaptChannelHome: adaptChannelHome,
    adaptChannelAbout: adaptChannelAbout,
    ytClassify: ytClassify,
    finalTextFor: finalTextFor,
    dbgLog: DBG_LOG
  };

  __ytm15Backend = EXPORTS;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = EXPORTS;
  }
})();