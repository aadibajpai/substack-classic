const { Component } = window.Torus;
const html = window.jdom;

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Random page number for "Continued on Page..."
function R() {
  const MAX_PAGE = 30;
  return ~~(Math.random() * MAX_PAGE);
}

const debounce = (fn, delayMillis) => {
  let lastRun = 0;
  let to = null;
  return (...args) => {
    clearTimeout(to);
    const now = Date.now();
    const dfn = () => {
      lastRun = now;
      fn(...args);
    };
    if (now - lastRun > delayMillis) {
      dfn();
    } else {
      to = setTimeout(dfn, delayMillis);
    }
  };
};

function formatRelativeDate(timestamp) {
  if (!timestamp) {
    return "some time ago";
  }

  const date = new Date(timestamp);
  const delta = (Date.now() - date) / 1000;
  if (delta < 60) {
    return "< 1 min ago";
  } else if (delta < 3600) {
    return `${~~(delta / 60)} min ago`;
  } else if (delta < 86400) {
    const day = ~~(delta / 3600);
    return day === 1 ? `${day} hr ago` : `${day} hrs ago`;
  } else if (delta < 86400 * 2) {
    return "yesterday";
  } else if (delta < 86400 * 3) {
    return "2 days ago";
  } else {
    return date.toLocaleDateString();
  }
}

// for header top bar
function formatDate() {
  const date = new Date();
  return `${DAYS[date.getDay()]}, ${
    MONTHS[date.getMonth()]
  } ${date.getDate()}, ${date.getFullYear()}`;
}

// return list of writers as formatted string
function formatWriters(writers) {
  if (!writers || writers.length === 0) return "Unknown";
  const decoded = writers.map(decodeHTMLEntities);
  const writer = decoded[decoded.length - 1];
  return decoded.length > 1
    ? decoded.slice(0, -1).join(", ") + " and " + writer
    : writer;
}

function decodeHTMLEntities(s) {
  if (!s) return "";
  const div = document.createElement("div");
  div.innerHTML = s;
  return div.textContent || div.innerText || "";
}

// Router
function getRoute() {
  const hash = window.location.hash.slice(1); // remove #
  if (!hash || hash === "/") return { view: "landing" };

  const feedMatch = hash.match(/^\/@([^/]+)$/);
  if (feedMatch) return { view: "feed", username: feedMatch[1] };

  const storyMatch = hash.match(/^\/@([^/]+)\/story\/(.+)$/);
  if (storyMatch)
    return { view: "story", username: storyMatch[1], storyId: storyMatch[2] };

  return { view: "landing" };
}

// Fetch stories from Substack via rss2json
async function fetchSubstackFeed(username) {
  const resp = await fetch(
    `https://api.rss2json.com/v1/api.json?rss_url=https://${username}.substack.com/feed`
  )
    .then((r) => r.json())
    .catch(console.error);

  if (!resp || resp.status !== "ok") {
    throw new Error(resp?.message || "Failed to fetch feed");
  }

  return {
    publication: {
      title: resp.feed.title,
      description: resp.feed.description,
      image: resp.feed.image,
      link: resp.feed.link,
    },
    stories: resp.items.map((item) => ({
      id: encodeURIComponent(item.guid),
      title: item.title,
      author: item.author,
      date: item.pubDate,
      excerpt: item.description,
      content: item.content,
      image: item.enclosure?.link || item.thumbnail || null,
      link: item.link,
    })),
  };
}

// Story body for feed view (truncated)
function StoryBodyExcerpt(created, text) {
  if (!text) {
    text = `Lorem ipsum dolor sit amet, ei mel cibo meliore instructior, eam te etiam clita.`;
  }

  // Strip HTML tags for excerpt
  const stripped = decodeHTMLEntities(text);
  const words = stripped.split(" ");
  if (words.length > 100) {
    return [
      html`<p>
        ${formatRelativeDate(created)}–${words.slice(0, 100).join(" ")} ...
      </p>`,
      html`<p class="continued"><em>Continued on Page A${R()}</em></p>`,
    ];
  }

  return html`<p>${formatRelativeDate(created)}–${stripped}</p>`;
}

// Story body for full article view
function StoryBodyFull(created, text) {
  if (!text) {
    text = `<p>Content not available.</p>`;
  }

  let ret = [html`<p>${formatRelativeDate(created)}–</p>`];
  let content = document.createElement("div");
  content.innerHTML = text;
  ret.push(...content.children);
  return ret;
}

// Story component for feed view
function Story(story, username) {
  if (!story) {
    return null;
  }

  const { title, author, id, excerpt, image, date } = story;
  const storyUrl = `#/@${username}/story/${id}`;

  return html`<div class="story">
    <a href="${storyUrl}">
      <h2 class="story-title">${decodeHTMLEntities(title)}</h2>
    </a>
    <div class="story-byline">
      By
      <span class="story-author">${formatWriters([author])}</span>
    </div>
    <a href="${storyUrl}">
      ${image ? html`<img class="story-image" src="${image}" />` : null}
      <div class="story-content">${StoryBodyExcerpt(date, excerpt)}</div>
    </a>
  </div>`;
}

// Full story component for article view
function FullStory(story) {
  if (!story) {
    return null;
  }

  const { title, author, link, content, image, date } = story;

  return html`<div class="story">
    <a href="${link}" target="_blank">
      <h2 class="story-title">${decodeHTMLEntities(title)}</h2>
    </a>
    <div class="story-byline">
      By
      <span class="story-author">${formatWriters([author])}</span>
    </div>
    ${image
      ? html`<img class="story-image full-story-image" src="${image}" />`
      : null}
    <div class="story-content full-story-content">
      ${StoryBodyFull(date, content)}
    </div>
  </div>`;
}

// Landing page component
function LandingView(app) {
  const handleSubmit = (e) => {
    e.preventDefault();
    const input = e.target.querySelector("input");
    const username = input.value.trim();
    if (username) {
      window.location.hash = `#/@${username}`;
    }
  };

  return html`<div class="landing">
    <h1 class="fraktur landing-title">Substack Classic</h1>
    <p class="landing-description">
      View any Substack newsletter in the style of a classic newspaper.
    </p>
    <form class="landing-form" onsubmit=${handleSubmit}>
      <input
        type="text"
        class="landing-input"
        placeholder="Enter Substack username"
        autofocus
      />
      <button type="submit" class="landing-button">Read</button>
    </form>
    <p class="landing-hint">
      Try: <a href="#/@rawandferal">raw and feral</a>,
      <a href="#/@ratorthodox">ratorthodox</a>,
      <a href="#/@usefulfictions">useful fictions</a>
    </p>
  </div>`;
}

class App extends Component {
  init() {
    this.route = getRoute();
    this.stories = [];
    this.publication = null;
    this._loading = false;
    this._error = null;

    this.resize = debounce(this.resize.bind(this), 500);
    window.addEventListener("resize", this.resize);
    window.addEventListener("hashchange", () => {
      this.route = getRoute();
      this.stories = [];
      this.publication = null;
      this._error = null;
      if (this.route.view !== "landing") {
        this.fetch();
      } else {
        this.render();
      }
    });

    if (this.route.view !== "landing") {
      this.fetch();
    }
  }

  resize() {
    this.render();
  }

  async fetch() {
    this._loading = true;
    this._error = null;
    this.render();

    try {
      const data = await fetchSubstackFeed(this.route.username);
      this.publication = data.publication;
      this.stories = data.stories;
    } catch (err) {
      this._error = err.message || "Failed to load feed";
    }

    this._loading = false;
    this.render();
  }

  composeLanding() {
    return html`<div class="app landing-app">${LandingView(this)}</div>`;
  }

  composeStory() {
    const story = this.stories.find((s) => s.id === this.route.storyId);

    const scale = Math.min((window.innerWidth / 1200) * 0.96, 1);

    return html`<div
      class="app flex-column"
      style="transform: scale(${scale}) translate(-50%, 0)"
    >
      <header class="flex-column">
        <div class="header-main flex-row">
          <div class="header-tagline header-main-aside">
            "All the Subs <br />
            That Are Fit to Stack"
          </div>
          <a href="#/@${this.route.username}" class="masthead-link">
            <h1 class="fraktur masthead">
              ${decodeHTMLEntities(this.publication?.title) || "Loading..."}
            </h1>
          </a>
          <div class="header-edition header-main-aside">
            <div class="header-edition-title">The Classic Edition</div>
            <p class="header-edition-body justify">
              This is
              <a href="${this.publication?.link || "#"}" target="_blank">
                <strong>${decodeHTMLEntities(this.publication?.title) || "a Substack"}</strong></a
              >
              reimagined in the style of a certain well-known metropolitan
              newspaper.
            </p>
          </div>
        </div>
        <div class="header-bar flex-row">
          <div class="header-vol bar-aside">
            VOL. CLXX . . . No. ${Math.random() > 0.5 ? 3.14159 : 4.2069}
          </div>
          <div class="header-nyc">${formatDate()}</div>
          <div class="header-controls bar-aside flex-row">
            <a href="#/@${this.route.username}">Back to feed</a>
          </div>
        </div>
      </header>
      ${this._loading
        ? html`<div class="loading">Loading story...</div>`
        : this._error
          ? html`<div class="error">${this._error}</div>`
          : html`<div class="main flex-row story-main">
              <div class="center-spread full-story">${FullStory(story)}</div>
            </div>`}
      <footer>
        <p>
          Built by <a href="/">Aadi Bajpai</a> with
          <a target="_blank" href="https://github.com/thesephist/unim.press"
            >unim.press</a
          >. <a href="/">Try another Substack</a>.
          <a target="_blank" href="https://github.com/aadibajpai/substack-classic"
            >Source</a
          >.
        </p>
      </footer>
    </div>`;
  }

  composeFeed() {
    const stories = this.stories.slice();
    const username = this.route.username;

    const centerSpreads = stories.slice(0, 2);
    const leftSidebar = stories.slice(2, 6);
    const sidebarSpread = stories.slice(6, 9);
    const bottom = stories.slice(9, 12);
    const mini = stories.slice(12, 16);
    const mini2 = stories.slice(16, 21);
    const mini3 = stories.slice(21, 25);

    const scale = Math.min((window.innerWidth / 1200) * 0.96, 1);

    const storiesSection = [
      html`<div class="main flex-row">
        <div class="left-sidebar flex-column smaller">
          ${leftSidebar.map((s) => Story(s, username))}
        </div>
        <div class="spreads flex-column">
          <div class="top flex-row">
            <div class="center-spread">
              ${centerSpreads.map((s) => Story(s, username))}
            </div>
            <div class="sidebar sidebar-spread flex-column smaller">
              ${sidebarSpread.map((s) => Story(s, username))}
            </div>
          </div>
          <div class="bottom flex-row">
            ${bottom.map((s) => Story(s, username))}
          </div>
        </div>
      </div>`,
      mini.length
        ? html`<div class="mini flex-row smaller">
            ${mini.map((s) => Story(s, username))}
          </div>`
        : null,
      mini2.length
        ? html`<div class="mini flex-row smaller">
            ${mini2.map((s) => Story(s, username))}
          </div>`
        : null,
      mini3.length
        ? html`<div class="mini flex-row smaller">
            ${mini3.map((s) => Story(s, username))}
          </div>`
        : null,
    ];

    return html`<div
      class="app flex-column"
      style="transform: scale(${scale}) translate(-50%, 0)"
    >
      <header class="flex-column">
        <div class="header-main flex-row">
          <div class="header-tagline header-main-aside">
            "All the Subs <br />
            That Are Fit to Stack"
          </div>
          <a href="#/@${username}" class="masthead-link">
            <h1 class="fraktur masthead">
              ${decodeHTMLEntities(this.publication?.title) || "Loading..."}
            </h1>
          </a>
          <div class="header-edition header-main-aside">
            <div class="header-edition-title">The Classic Edition</div>
            <p class="header-edition-body justify">
              This is
              <a href="${this.publication?.link || "#"}" target="_blank">
                <strong>${decodeHTMLEntities(this.publication?.title) || "a Substack"}</strong></a
              >
              reimagined in the style of a certain well-known metropolitan
              newspaper.
            </p>
          </div>
        </div>
        <div class="header-bar flex-row">
          <div class="header-vol bar-aside">
            VOL. CLXX . . . No. ${Math.random() > 0.5 ? 3.14159 : 4.2069}
          </div>
          <div class="header-nyc">${formatDate()}</div>
          <div class="header-controls bar-aside flex-row">
            <a href="/">Try another Substack</a>
          </div>
        </div>
      </header>
      ${this._loading
        ? html`<div class="loading">Loading stories...</div>`
        : this._error
          ? html`<div class="error">${this._error}</div>`
          : storiesSection}
      <footer>
        <p>
          Built by <a href="/">Aadi Bajpai</a> with
          <a target="_blank" href="https://github.com/thesephist/unim.press"
            >unim.press</a
          >. <a href="/">Try another Substack</a>.
          <a target="_blank" href="https://github.com/aadibajpai/substack-classic"
            >Source</a
          >.
        </p>
      </footer>
    </div>`;
  }

  compose() {
    switch (this.route.view) {
      case "landing":
        return this.composeLanding();
      case "story":
        return this.composeStory();
      case "feed":
      default:
        return this.composeFeed();
    }
  }
}

const app = new App();
document.body.appendChild(app.node);
