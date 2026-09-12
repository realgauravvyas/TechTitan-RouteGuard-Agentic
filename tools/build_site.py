"""Assemble the GitHub Pages preview into site/ from static/ and web/.

The hosted page reuses the exact UI of the local application and swaps only the
transport: web/local.js answers the same routes from web/engine.js instead of
server.py. static/ stays the single source of truth for markup and styling, so
the two builds cannot drift apart.

Every substitution is asserted. If static/index.html changes in a way this
script does not expect, the build fails instead of publishing a broken page.

Usage: python tools/build_site.py [--output site]
"""
import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = 'https://github.com/realgauravvyas/TechTitan-RouteGuard-Agentic'

# (description, find, replace) applied in order to static/index.html.
REWRITES = [
    # GitHub Pages serves a project site from a subpath, so root-absolute URLs break.
    ('stylesheet path', 'href="/style.css"', 'href="style.css"'),
    ('brand link', '<a class="brand" href="/"', '<a class="brand" href="./"'),
    # Load the browser engine and its transport before the shared UI script.
    ('script tags', '<script src="/app.js"></script>',
     '<script src="engine.js"></script><script src="local.js"></script><script src="app.js"></script>'),
    # Keep the hosted page honest: there is no local server and no SQLite here.
    ('sandbox note',
     '<span class="dot"></span> LOCAL SANDBOX<br><p>Every decision has evidence.<br>Every action is verified.</p>',
     '<span class="dot"></span> BROWSER SANDBOX<br><p>Runs entirely in your browser.<br>'
     'No server; nothing leaves the page.</p>'),
    ('state description', '<span>Symbolic planning · Exact allocation search · SQLite state</span>',
     '<span>Symbolic planning · Exact allocation search · Browser-local state</span>'),
    ('source link', 'Tech Zephyr 4.0 · Round 1</footer>',
     f'Tech Zephyr 4.0 · Round 1<br><a href="{REPO}" style="color:var(--mint)">Source &amp; submission</a></footer>'),
]


def build(output: Path) -> None:
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)

    for source, name in [(ROOT / 'static' / 'style.css', 'style.css'),
                         (ROOT / 'static' / 'app.js', 'app.js'),
                         (ROOT / 'web' / 'engine.js', 'engine.js'),
                         (ROOT / 'web' / 'local.js', 'local.js')]:
        shutil.copyfile(source, output / name)

    html = (ROOT / 'static' / 'index.html').read_text(encoding='utf-8')
    for description, find, replace in REWRITES:
        if html.count(find) != 1:
            raise SystemExit(f'build_site: expected exactly one {description!r} match in static/index.html; '
                             f'found {html.count(find)}. Update tools/build_site.py to match the new markup.')
        html = html.replace(find, replace, 1)
    (output / 'index.html').write_text(html, encoding='utf-8')

    # Publish the evidence files the page and README point judges at.
    evidence = output / 'submission'
    evidence.mkdir()
    for name in ['TechTitan_evidence_agentic.json', 'TechTitan_evaluation_agentic.json']:
        shutil.copyfile(ROOT / 'submission' / name, evidence / name)

    (output / '.nojekyll').write_text('', encoding='utf-8')
    files = sorted(p.relative_to(output).as_posix() for p in output.rglob('*') if p.is_file())
    print(f'built {output.relative_to(ROOT).as_posix()}/ with {len(files)} files:')
    for name in files:
        print(f'  {name}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default=str(ROOT / 'site'))
    build(Path(parser.parse_args().output))
