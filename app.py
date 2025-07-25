from flask import Flask, jsonify, render_template, request
import wikipediaapi
import networkx as nx
import wikipedia
from wikipedia.exceptions import DisambiguationError, PageError

wikipedia.set_lang("en")

app = Flask(__name__)
wiki = wikipediaapi.Wikipedia(language='en', user_agent='WikipediaGraphApp/1.0 (contact: your_email@example.com)')

def get_links(title, depth=1):
    G = nx.Graph()
    page = wiki.page(title)
    if not page.exists():
        return G
    G.add_node(title, relevance=1.0)  # main node = highest
    links = list(page.links.keys())[:1000]
    total = len(links)
    for i, link_title in enumerate(links):
        relevance = 1 - (i / total)  # early links => higher relevance
        G.add_node(link_title, relevance=relevance)
        G.add_edge(title, link_title)
    return G

@app.route('/api/graph/<query>')
def graph(query):
    depth = int(request.args.get("depth", 1))
    try:
        title = wikipedia.search(query)[0]
        G = get_links(title, depth)
    except IndexError:
        return jsonify({"error": "not_found"}), 404
    except DisambiguationError as e:
        return jsonify({"error": "disambiguation", "options": e.options}), 400
    nodes = [{"id": n, "relevance": G.nodes[n].get("relevance", 0)} for n in G.nodes()]
    edges = [{"source": u, "target": v} for u, v in G.edges()]
    return jsonify({"nodes": nodes, "links": edges})


@app.route('/api/summary/<title>')
def summary(title):
    page = wiki.page(title)
    if not page.exists():
        return jsonify({"summary": None})
    summary_text = page.summary[:500]  # truncate to ~first few lines
    return jsonify({"summary": summary_text})


@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True)

