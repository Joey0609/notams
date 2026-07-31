import unittest

import main


class UpstreamFailureTests(unittest.TestCase):
    def test_empty_fetch_with_different_hash_does_not_update_visits(self):
        current_data = {
            'NUM': 0,
            'HASH': 'empty-result-hash',
        }

        self.assertFalse(main.is_valid_fetch_result(current_data))
        self.assertFalse(
            main.should_update_visits('previous-valid-hash', current_data)
        )

    def test_nonempty_changed_fetch_updates_visits(self):
        current_data = {
            'NUM': 1,
            'HASH': 'new-valid-hash',
        }

        self.assertTrue(main.is_valid_fetch_result(current_data))
        self.assertTrue(
            main.should_update_visits('previous-valid-hash', current_data)
        )

    def test_nonempty_unchanged_fetch_does_not_update_visits(self):
        current_data = {
            'NUM': 1,
            'HASH': 'same-hash',
        }

        self.assertFalse(main.should_update_visits('same-hash', current_data))

    def test_malformed_num_is_treated_as_invalid(self):
        current_data = {
            'NUM': 'unknown',
            'HASH': 'different-hash',
        }

        self.assertFalse(main.is_valid_fetch_result(current_data))
        self.assertFalse(main.should_update_visits(None, current_data))


if __name__ == '__main__':
    unittest.main()
