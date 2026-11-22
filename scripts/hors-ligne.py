import re, os, base64, json, posixpath
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
mods, order = {}, []
def norm(base, rel): return posixpath.normpath(posixpath.join(posixpath.dirname(base), rel))
def load(path):
    if path in mods: return
    mods[path] = None
    src = open(os.path.join(R, path), encoding="utf8").read()
    deps = []
    def imp(m):
        names, dep = m.group(1).strip(), norm(path, m.group(2)); deps.append(dep)
        ref = f'__m[{json.dumps(dep)}]'
        if names.startswith("{"):
            inner = names[1:-1].replace(" as ", ": ")
            return f"const {{{inner}}} = {ref};"
        return f"const {names} = {ref}.default;"
    src = re.sub(r'^import\s+(.+?)\s+from\s+"([^"]+)";', imp, src, flags=re.M)
    exports = []
    def reexp(m):
        dep = norm(path, m.group(2)); deps.append(dep)
        return "".join(f'__e.{n.strip()} = __m[{json.dumps(dep)}].{n.strip()};' for n in m.group(1).split(","))
    src = re.sub(r'^export\s+\{([^}]+)\}\s+from\s+"([^"]+)";', reexp, src, flags=re.M)
    def exp(m):
        exports.append(m.group(2)); return m.group(1)
    src = re.sub(r'^export\s+((?:async\s+)?(?:const|let|function|class)\s+(\w+))', exp, src, flags=re.M)
    src = re.sub(r'^export default ', '__e.default = ', src, flags=re.M)
    def dyn(m):
        dep = norm(path, m.group(1)); deps.append(dep)
        return f'Promise.resolve(__m[{json.dumps(dep)}])'
    src = re.sub(r'import\("(\.[^"]+)"\)', dyn, src)
    src = src.replace('new URL("../data/dictionnaire.txt", import.meta.url)', '"assets/data/dictionnaire.txt"')
    assert "import.meta" not in src and not re.search(r'^\s*(import|export) ', src, re.M), path
    for d in deps: load(d)
    mods[path] = src + "\n" + "".join(f"__e.{n} = {n};" for n in exports)
    order.append(path)
load("assets/js/app.js")
js = "const __m = {};\n" + "\n".join(f"__m[{json.dumps(p)}] = (() => {{ const __e = {{}};\n{mods[p]}\nreturn __e; }})();" for p in order)
js = js.replace("</script", "<\\/script")
css = open(f"{R}/assets/css/style.css", encoding="utf8").read()
for f in ["dm-sans","archivo-black","anonymous-pro"]:
    b = base64.b64encode(open(f"{R}/assets/fonts/{f}.woff","rb").read()).decode()
    css = css.replace(f'url("../fonts/{f}.woff")', f'url("data:font/woff;base64,{b}")')
html = open(f"{R}/index.html", encoding="utf8").read()
html = re.sub(r'\s*<link rel="preload"[^>]+>', "", html)
html = html.replace('<link rel="stylesheet" href="assets/css/style.css" />', f"<style>\n{css}\n</style>")
html = html.replace('<script type="module" src="assets/js/app.js"></script>', "")
html = html.replace("</body>", f"<script>\n{js}\n</script>\n</body>")
html = html.replace("<title>", "<!-- Version « double-clic » générée automatiquement (python scripts/hors-ligne.py). -->\n    <title>")
open(f"{R}/jouer.html","w",encoding="utf8").write(html)
print(order, len(html))
