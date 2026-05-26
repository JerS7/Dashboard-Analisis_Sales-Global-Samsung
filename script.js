let rawData = [];
    const DATA_URL = "csvjson.json";
    const monthOrder = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const state = { theme: "tactile", year: "All", region: "All", category: "All", channel: "All", segment: "All" };
    const els = {
      theme: document.getElementById("themeSelect"),
      year: document.getElementById("yearFilter"),
      region: document.getElementById("regionFilter"),
      category: document.getElementById("categoryFilter"),
      channel: document.getElementById("channelFilter"),
      segment: document.getElementById("segmentFilter")
    };

    const fmtCurrency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    const fmtNumber = new Intl.NumberFormat("en-US");
    const css = name => getComputedStyle(document.body).getPropertyValue(name).trim();

    function unique(field) {
      return [...new Set(rawData.map(row => row[field]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    }

    function fillSelect(select, values, label = "Semua") {
      select.innerHTML = `<option value="All">${label}</option>` + values.map(value => `<option value="${String(value)}">${String(value)}</option>`).join("");
    }

    async function loadData() {
      try {
        const response = await fetch(DATA_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        rawData = await response.json();
        if (!Array.isArray(rawData)) throw new Error("JSON root harus berupa array transaksi.");
        initFilters();
        render();
      } catch (error) {
        console.error("Gagal memuat data:", error);
        document.getElementById("nodeRows").textContent = "Data error";
        document.getElementById("nodeRevenue").textContent = "Cek JSON";
        document.getElementById("periodRows").textContent = "0 rows";
        document.getElementById("periodRevenue").textContent = "$0";
      }
    }

    function initFilters() {
      fillSelect(els.year, unique("year"), "Semua Tahun");
      fillSelect(els.region, unique("region"), "Semua Region");
      fillSelect(els.category, unique("category"), "Semua Kategori");
      fillSelect(els.channel, unique("sales_channel"), "Semua Channel");
      fillSelect(els.segment, unique("customer_segment"), "Semua Segmen");
      els.theme.addEventListener("change", () => {
        state.theme = els.theme.value;
        setTheme(state.theme);
        render();
      });
      ["year", "region", "category", "channel", "segment"].forEach(key => {
        els[key].addEventListener("change", () => {
          state[key] = els[key].value;
          render();
        });
      });
      setTheme(state.theme);
    }

    function setTheme(theme) {
      document.body.classList.toggle("theme-orbit", theme === "orbit");
      document.body.classList.toggle("theme-graphite", theme === "graphite");
    }

    function filteredData() {
      return rawData.filter(row =>
        (state.year === "All" || String(row.year) === state.year) &&
        (state.region === "All" || row.region === state.region) &&
        (state.category === "All" || row.category === state.category) &&
        (state.channel === "All" || row.sales_channel === state.channel) &&
        (state.segment === "All" || row.customer_segment === state.segment)
      );
    }

    function sum(rows, field) {
      return rows.reduce((total, row) => total + Number(row[field] || 0), 0);
    }

    function groupBy(rows, field) {
      return rows.reduce((acc, row) => {
        const key = row[field] || "Unknown";
        if (!acc.has(key)) acc.set(key, []);
        acc.get(key).push(row);
        return acc;
      }, new Map());
    }

    function renderMetrics(rows) {
      const revenue = sum(rows, "revenue_usd");
      const units = sum(rows, "units_sold");
      const ratings = rows.map(row => Number(row.customer_rating)).filter(Boolean);
      const returned = rows.filter(row => String(row.return_status || "").toLowerCase() !== "kept").length;
      document.getElementById("totalRevenue").textContent = fmtCurrency.format(revenue);
      document.getElementById("totalUnits").textContent = fmtNumber.format(units);
      document.getElementById("avgRating").textContent = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2) : "N/A";
      document.getElementById("returnRate").textContent = rows.length ? `${((returned / rows.length) * 100).toFixed(1)}%` : "0%";
      document.getElementById("revenueDelta").textContent = `${fmtNumber.format(rows.length)} transaksi terfilter`;
      document.getElementById("unitDelta").textContent = `${fmtCurrency.format(units ? revenue / units : 0)} revenue per unit`;
      document.getElementById("ratingDelta").textContent = `${fmtNumber.format(ratings.length)} transaksi memiliki rating`;
      document.getElementById("returnDelta").textContent = `${fmtNumber.format(returned)} return/refund/cancelled`;
      document.getElementById("nodeRows").textContent = `${fmtNumber.format(rows.length)} rows`;
      document.getElementById("nodeRevenue").textContent = fmtCurrency.format(revenue);
    }

    function renderCategoryScores(rows) {
      const grouped = groupBy(rows, "category");
      const totalRevenue = Math.max(sum(rows, "revenue_usd"), 1);
      const items = [...grouped.entries()].map(([category, records]) => {
        const revenue = sum(records, "revenue_usd");
        const units = sum(records, "units_sold");
        const ratings = records.map(row => Number(row.customer_rating)).filter(Boolean);
        const rating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
        const score = (revenue / totalRevenue) * 70 + (rating / 5) * 30;
        return { category, revenue, units, rating, score };
      }).sort((a, b) => b.score - a.score);
      document.getElementById("categoryScores").innerHTML = items.map(item => `
        <div class="score-row">
          <div class="row-top"><strong>${item.category}</strong><span class="mono">${item.score.toFixed(1)}</span></div>
          <div class="bar" aria-hidden="true"><span style="--w:${Math.min(100, item.score).toFixed(1)}%"></span></div>
          <div class="bundle-meta">
            <span class="pill">${fmtCurrency.format(item.revenue)}</span>
            <span class="pill">${fmtNumber.format(item.units)} units</span>
            <span class="pill">${item.rating ? item.rating.toFixed(2) : "N/A"} rating</span>
          </div>
        </div>
      `).join("") || `<div class="empty">Tidak ada data untuk filter ini.</div>`;
    }

    function aggregatePeriod(rows) {
      const years = [...new Set(rows.map(row => row.year))].sort();
      const keys = [];
      years.forEach(year => monthOrder.forEach(month => keys.push(`${year}-${month}`)));
      const map = new Map(keys.map(key => [key, { label: key.replace("-", " "), revenue: 0, units: 0 }]));
      rows.forEach(row => {
        const key = `${row.year}-${row.month}`;
        if (!map.has(key)) map.set(key, { label: `${row.year} ${row.month}`, revenue: 0, units: 0 });
        map.get(key).revenue += Number(row.revenue_usd || 0);
        map.get(key).units += Number(row.units_sold || 0);
      });
      return [...map.values()];
    }

    function drawPeriodChart(rows) {
      const data = aggregatePeriod(rows);
      const canvas = document.getElementById("periodChart");
      const ctx = setupCanvas(canvas);
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const pad = { l: 54, r: 22, t: 22, b: 48 };
      drawGrid(ctx, w, h, pad);
      const maxRevenue = Math.max(...data.map(d => d.revenue), 1);
      const maxUnits = Math.max(...data.map(d => d.units), 1);
      const step = (w - pad.l - pad.r) / Math.max(data.length - 1, 1);
      ctx.lineWidth = 2;
      ctx.strokeStyle = css("--primary");
      ctx.beginPath();
      data.forEach((d, i) => {
        const x = pad.l + i * step;
        const y = pad.t + (1 - d.revenue / maxRevenue) * (h - pad.t - pad.b);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
      ctx.strokeStyle = css("--accent");
      ctx.beginPath();
      data.forEach((d, i) => {
        const x = pad.l + i * step;
        const y = pad.t + (1 - d.units / maxUnits) * (h - pad.t - pad.b);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
      data.forEach((d, i) => {
        if (i % Math.ceil(data.length / 8) !== 0) return;
        const x = pad.l + i * step;
        ctx.fillStyle = css("--muted");
        ctx.font = "11px JetBrains Mono, monospace";
        ctx.save();
        ctx.translate(x, h - 24);
        ctx.rotate(-0.55);
        ctx.fillText(d.label.replace(" ", " "), 0, 0);
        ctx.restore();
      });
      drawLegend(ctx, [{ label: "Revenue", color: css("--primary") }, { label: "Units", color: css("--accent") }], pad.l, 18);
      const period = rows.length ? `${Math.min(...rows.map(r => r.year))}-${Math.max(...rows.map(r => r.year))}` : "N/A";
      document.getElementById("periodRange").textContent = period;
      document.getElementById("periodRows").textContent = `${fmtNumber.format(rows.length)} rows`;
      document.getElementById("periodRevenue").textContent = fmtCurrency.format(sum(rows, "revenue_usd"));
    }

    function renderSegmentChart(rows) {
      const grouped = [...groupBy(rows, "customer_segment").entries()]
        .map(([segment, records]) => ({ segment, revenue: sum(records, "revenue_usd") }))
        .sort((a, b) => b.revenue - a.revenue);
      const canvas = document.getElementById("segmentChart");
      const ctx = setupCanvas(canvas);
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const total = Math.max(grouped.reduce((a, b) => a + b.revenue, 0), 1);
      let start = -Math.PI / 2;
      const colors = [css("--primary"), css("--accent"), css("--good"), css("--warn"), css("--bad")];
      grouped.forEach((item, i) => {
        const angle = (item.revenue / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(w * 0.33, h * 0.5);
        ctx.arc(w * 0.33, h * 0.5, Math.min(w, h) * 0.31, start, start + angle);
        ctx.closePath();
        ctx.fillStyle = colors[i % colors.length];
        ctx.fill();
        start += angle;
      });
      grouped.forEach((item, i) => {
        const y = 40 + i * 34;
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(w * 0.62, y - 12, 14, 14);
        ctx.fillStyle = css("--text");
        ctx.font = "12px Inter, sans-serif";
        ctx.fillText(item.segment, w * 0.62 + 22, y);
        ctx.fillStyle = css("--muted");
        ctx.font = "11px JetBrains Mono, monospace";
        ctx.fillText(`${((item.revenue / total) * 100).toFixed(1)}%`, w * 0.62 + 22, y + 16);
      });
    }

    function setupCanvas(canvas) {
      const rect = canvas.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * scale));
      canvas.height = Math.max(1, Math.floor(rect.height * scale));
      const ctx = canvas.getContext("2d");
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      canvas.width = rect.width;
      canvas.height = rect.height;
      return canvas.getContext("2d");
    }

    function drawGrid(ctx, w, h, pad) {
      ctx.strokeStyle = css("--soft-line");
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad.t + i * ((h - pad.t - pad.b) / 4);
        ctx.beginPath();
        ctx.moveTo(pad.l, y);
        ctx.lineTo(w - pad.r, y);
        ctx.stroke();
      }
    }

    function drawLegend(ctx, items, x, y) {
      items.forEach((item, i) => {
        const lx = x + i * 94;
        ctx.fillStyle = item.color;
        ctx.fillRect(lx, y, 18, 4);
        ctx.fillStyle = css("--muted");
        ctx.font = "11px JetBrains Mono, monospace";
        ctx.fillText(item.label, lx + 24, y + 5);
      });
    }

    class FPNode {
      constructor(item, parent = null) {
        this.item = item;
        this.count = 0;
        this.parent = parent;
        this.children = new Map();
        this.link = null;
      }
    }

    function buildFPTree(transactions, minSupport) {
      const counts = new Map();
      transactions.forEach(items => items.forEach(item => counts.set(item, (counts.get(item) || 0) + 1)));
      const frequent = [...counts.entries()].filter(([, count]) => count >= minSupport).sort((a, b) => b[1] - a[1]);
      const order = new Map(frequent.map(([item], i) => [item, i]));
      const root = new FPNode(null);
      const headers = new Map(frequent.map(([item, count]) => [item, { count, head: null }]));
      transactions.forEach(items => {
        const ordered = [...new Set(items)].filter(item => order.has(item)).sort((a, b) => order.get(a) - order.get(b));
        let node = root;
        ordered.forEach(item => {
          if (!node.children.has(item)) {
            const child = new FPNode(item, node);
            node.children.set(item, child);
            const header = headers.get(item);
            if (!header.head) header.head = child;
            else {
              let link = header.head;
              while (link.link) link = link.link;
              link.link = child;
            }
          }
          node = node.children.get(item);
          node.count += 1;
        });
      });
      return { root, headers };
    }

    function mineFPTree(tree, suffix, minSupport, out) {
      const entries = [...tree.headers.entries()].sort((a, b) => a[1].count - b[1].count);
      entries.forEach(([item, header]) => {
        const itemset = [item, ...suffix];
        out.push({ items: itemset, support: header.count });
        const conditional = [];
        let node = header.head;
        while (node) {
          const path = [];
          let parent = node.parent;
          while (parent && parent.item) {
            path.unshift(parent.item);
            parent = parent.parent;
          }
          for (let i = 0; i < node.count; i++) if (path.length) conditional.push(path);
          node = node.link;
        }
        if (conditional.length) {
          const next = buildFPTree(conditional, minSupport);
          if (next.headers.size) mineFPTree(next, itemset, minSupport, out);
        }
      });
    }

    function marketBasket(rows) {
      const baskets = new Map();
      rows.forEach(row => {
        const key = row.sale_date || "Unknown";
        if (!baskets.has(key)) baskets.set(key, new Set());
        baskets.get(key).add(row.product_name);
      });
      const transactions = [...baskets.values()].map(set => [...set]).filter(items => items.length > 1);
      const minSupport = Math.max(3, Math.ceil(transactions.length * 0.025));
      if (!transactions.length) return { transactions: [], minSupport, rules: [] };
      const mined = [];
      const tree = buildFPTree(transactions, minSupport);
      mineFPTree(tree, [], minSupport, mined);
      const supportMap = new Map(mined.map(entry => [entry.items.slice().sort().join("||"), entry.support]));
      const rules = mined
        .filter(entry => entry.items.length >= 2)
        .map(entry => {
          const items = entry.items.slice().sort();
          const antecedent = [items[0]];
          const consequent = items.slice(1);
          const antecedentSupport = supportMap.get(antecedent.join("||")) || transactions.filter(t => antecedent.every(i => t.includes(i))).length || 1;
          const consequentSupport = transactions.filter(t => consequent.every(i => t.includes(i))).length || 1;
          const confidence = entry.support / antecedentSupport;
          const lift = confidence / (consequentSupport / transactions.length);
          return { items, antecedent, consequent, support: entry.support, confidence, lift };
        })
        .sort((a, b) => (b.lift * b.confidence * b.support) - (a.lift * a.confidence * a.support))
        .slice(0, 8);
      return { transactions, minSupport, rules };
    }

    function renderBasket(rows) {
      const result = marketBasket(rows);
      document.getElementById("basketStats").textContent = `${fmtNumber.format(result.transactions.length)} baskets - min ${result.minSupport}`;
      document.getElementById("nodeBundles").textContent = `${result.rules.length} rules`;
      document.getElementById("bundleList").innerHTML = result.rules.map(rule => `
        <div class="bundle-row">
          <div class="bundle-items">${rule.antecedent.join(", ")} -> ${rule.consequent.join(", ")}</div>
          <div class="bundle-meta">
            <span class="pill">support ${rule.support}</span>
            <span class="pill">confidence ${(rule.confidence * 100).toFixed(1)}%</span>
            <span class="pill">lift ${rule.lift.toFixed(2)}x</span>
          </div>
        </div>
      `).join("") || `<div class="empty">Belum ada basket multi-produk yang melewati minimum support pada filter ini.</div>`;
    }

    function renderProductTable(rows) {
      const products = [...groupBy(rows, "product_name").entries()].map(([product, records]) => {
        const ratings = records.map(row => Number(row.customer_rating)).filter(Boolean);
        return {
          product,
          revenue: sum(records, "revenue_usd"),
          units: sum(records, "units_sold"),
          rating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0
        };
      }).sort((a, b) => b.revenue - a.revenue).slice(0, 12);
      document.getElementById("productTable").innerHTML = products.map(item => `
        <tr>
          <td>${item.product}</td>
          <td>${fmtCurrency.format(item.revenue)}</td>
          <td>${fmtNumber.format(item.units)}</td>
          <td>${item.rating ? item.rating.toFixed(2) : "N/A"}</td>
        </tr>
      `).join("");
    }

    function renderChannels(rows) {
      const total = Math.max(sum(rows, "revenue_usd"), 1);
      const channels = [...groupBy(rows, "sales_channel").entries()].map(([channel, records]) => ({
        channel,
        revenue: sum(records, "revenue_usd"),
        units: sum(records, "units_sold")
      })).sort((a, b) => b.revenue - a.revenue);
      document.getElementById("channelList").innerHTML = channels.map(item => `
        <div class="rank-row">
          <div class="row-top"><strong>${item.channel}</strong><span class="mono">${((item.revenue / total) * 100).toFixed(1)}%</span></div>
          <div class="bar"><span style="--w:${((item.revenue / total) * 100).toFixed(1)}%"></span></div>
          <div class="bundle-meta">
            <span class="pill">${fmtCurrency.format(item.revenue)}</span>
            <span class="pill">${fmtNumber.format(item.units)} units</span>
          </div>
        </div>
      `).join("") || `<div class="empty">Tidak ada channel untuk filter ini.</div>`;
    }

    function render() {
      const rows = filteredData();
      renderMetrics(rows);
      renderCategoryScores(rows);
      drawPeriodChart(rows);
      renderSegmentChart(rows);
      renderBasket(rows);
      renderProductTable(rows);
      renderChannels(rows);
    }

    function ambient() {
      const canvas = document.getElementById("ambient");
      const ctx = canvas.getContext("2d");
      let t = 0;
      function frame() {
        const scale = window.devicePixelRatio || 1;
        const w = canvas.clientWidth * scale;
        const h = canvas.clientHeight * scale;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
        ctx.strokeStyle = css("--line");
        ctx.lineWidth = 1;
        for (let y = -40; y < canvas.clientHeight + 40; y += 34) {
          ctx.beginPath();
          for (let x = 0; x <= canvas.clientWidth; x += 28) {
            const yy = y + Math.sin(x * 0.011 + t) * 6;
            x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
          }
          ctx.stroke();
        }
        t += 0.006;
        requestAnimationFrame(frame);
      }
      frame();
    }

    window.addEventListener("resize", render);
    ambient();
    loadData();

