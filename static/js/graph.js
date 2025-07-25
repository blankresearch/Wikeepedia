let currentDepth = 1;
let explored = new Set();
let nodes = [];
let links = [];
let simulation;
let svg;
let g;

function updateGraph() {
  const link = g.selectAll(".link")
    .data(links, d => d.source.id + "-" + d.target.id);

  link.enter().append("line")
    .attr("class", "link")
    .merge(link);

  link.exit().remove();

  const node = g.selectAll(".node")
    .data(nodes, d => d.id);

  const nodeEnter = node.enter().append("g")
    .attr("class", "node")
    .style("cursor", "pointer");

  const maxRelevance = d3.max(nodes, n => n.relevance || 0);
  const colorScale = d3.scaleLinear()
    .domain([0, maxRelevance || 1])
    .range(["#e0d8f4", "#2d1b4f"]);

  const defs = svg.append("defs");

  nodes.forEach((d, i) => {
    const gradient = defs.append("radialGradient")
      .attr("id", `grad-${i}`)
      .attr("cx", "50%")
      .attr("cy", "50%")
      .attr("r", "50%");

    gradient.append("stop")
      .attr("offset", "0%")
      .attr("stop-color", colorScale(d.relevance || 0))
      .attr("stop-opacity", 1);

    gradient.append("stop")
      .attr("offset", "90%")
      .attr("stop-color", colorScale(d.relevance || 0))
      .attr("stop-opacity", 0);
  });

  nodeEnter.append("circle")
    .attr("r", 10)
    .attr("fill", (d, i) => `url(#grad-${i})`);

  nodeEnter.append("text")
    .attr("dx", 12)
    .attr("dy", ".35em")
    .style("font-family", "font-geneva, sans-serif")
    .style("font", "12px sans-serif")
    .style("pointer-events", "none")
    .style("fill", "#333")
    .style("text-shadow", "0 1px 0 #fff, 1px 0 0 #fff, 0 -1px 0 #fff, -1px 0 0 #fff")
    .style("letter-spacing", "0.05em")
    .text(d => d.id);

  nodeEnter.merge(node)
    .on("click", (event, d) => {
      if (event.altKey) {
        const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(d.id)}`;
        window.open(url, '_blank');
      } else {
        loadGraph(d.id, currentDepth);
      }
    })
    .on("dblclick", (event, d) => {
      loadAndExpandNode(d.id);
    })
    .on("mouseover", (event, d) => {
      const tooltip = document.getElementById("tooltip");
      const padding = 20;
      const tooltipWidth = 300;
      const tooltipHeight = 100;

      let left = Math.min(event.pageX + 10, window.innerWidth - tooltipWidth - padding);
      let top = Math.min(event.pageY + 10, window.innerHeight - tooltipHeight - padding);

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
      tooltip.classList.remove("hidden");
      tooltip.innerText = "Loading summary...";

      fetch(`/api/summary/${encodeURIComponent(d.id)}`)
        .then(res => res.json())
        .then(data => {
          tooltip.innerText = data.summary || "No summary available.";
        })
        .catch(() => {
          tooltip.innerText = "Error loading summary.";
        });
    })
    .on("mouseout", () => {
      document.getElementById("tooltip").classList.add("hidden");
    });

  node.exit().remove();

  g.selectAll(".node text").text(d => d.id);

  simulation.nodes(nodes);
  simulation.force("link").links(links);
  simulation.alpha(1).restart();

  simulation.on("tick", () => {
    g.selectAll(".link")
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    g.selectAll(".node")
      .attr("transform", d => `translate(${d.x},${d.y})`);
  });
}

function loadAndExpandNode(title) {
  if (explored.has(title)) return;
  explored.add(title);
  fetch(`/api/graph/${encodeURIComponent(title)}?depth=1`)
    .then(res => res.json())
    .then(data => {
      const newNodes = data.nodes.filter(newNode => !nodes.find(n => n.id === newNode.id));
      const newLinks = data.links.filter(newLink => {
        const src = newLink.source;
        const tgt = newLink.target;
        return !links.find(l => l.source.id === src && l.target.id === tgt);
      });
      nodes.push(...newNodes);
      links.push(...newLinks);
      updateGraph();
    });
}

function showDisambiguationOptions(options, depth) {
  const box = document.getElementById("disambiguation-box");
  const list = document.getElementById("disambiguation-options");
  list.innerHTML = "";
  options.forEach(option => {
    const li = document.createElement("li");
    li.textContent = option;
    li.className = "cursor-pointer hover:bg-gray-100 px-2 py-1 rounded";
    li.onclick = () => {
      box.classList.add("hidden");
      loadGraph(option, depth);
    };
    list.appendChild(li);
  });
  box.classList.remove("hidden");
}

function loadGraph(title, depth) {
  if (!title || isNaN(depth) || depth < 1 || depth > 3) {
    return alert("Please enter a query and a depth between 1 and 3.");
  }

  d3.selectAll("svg").remove();
  nodes = [];
  links = [];
  explored.clear();

  svg = d3.select("body").append("svg");
  g = svg.append("g");

  const zoomBehavior = d3.zoom().on("zoom", event => {
    g.attr("transform", event.transform);
    if (simulation) {
      const repulsion = Math.max(-2000, -1500 * event.transform.k);
      simulation.force("charge", d3.forceManyBody().strength(repulsion));
      simulation.alpha(0.3).restart();
    }
  });
  svg.call(zoomBehavior);

  fetch(`/api/graph/${encodeURIComponent(title)}?depth=${depth}`)
    .then(async res => {
      if (res.status === 400) {
        const data = await res.json();
        if (data.error === "disambiguation") {
          showDisambiguationOptions(data.options, depth);
          return;
        }
      }
      const data = await res.json();
      document.getElementById("disambiguation-box").classList.add("hidden");
      nodes = data.nodes;
      links = data.links;
      explored.add(title);
      simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(200))
        .force("charge", d3.forceManyBody().strength(-1500))
        .force("center", d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2))
        .force("collision", d3.forceCollide(2));
      updateGraph();
    });
}

document.getElementById("wikiInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const query = document.getElementById("wikiInput").value.trim();
    const depth = parseInt(document.getElementById("depthInput").value);
    if (query) {
      currentDepth = depth;
      loadGraph(query, depth);
    }
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const defaultTitle = "Simone Weil";
  const defaultDepth = 1;
  document.getElementById("wikiInput").value = defaultTitle;
  document.getElementById("depthInput").value = defaultDepth;
  loadGraph(defaultTitle, defaultDepth);
});