import importlib.util
from pathlib import Path
import tempfile
import unittest


SPEC = importlib.util.spec_from_file_location("environment_digest", Path(__file__).with_name("python_environment_digest.py"))
POLICY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(POLICY)


class EnvironmentDigestTests(unittest.TestCase):
    def test_modified_added_and_removed_files_change_fingerprint(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            file = root / "package.py"
            file.write_text("original", encoding="utf-8")
            original = POLICY.environment_digest(root)
            file.write_text("modified", encoding="utf-8")
            self.assertNotEqual(original, POLICY.environment_digest(root))
            file.write_text("original", encoding="utf-8")
            self.assertEqual(original, POLICY.environment_digest(root))
            extra = root / "extra.py"
            extra.write_text("injected", encoding="utf-8")
            self.assertNotEqual(original, POLICY.environment_digest(root))
            extra.unlink()
            file.unlink()
            self.assertNotEqual(original, POLICY.environment_digest(root))


if __name__ == "__main__":
    unittest.main()
