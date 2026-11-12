"""
IDCard Table API Compatibility Shim
====================================
Relocated to `tables.views.table_api`.
Maintained here for 100% zero-regression backward compatibility.
"""

from tables.views import table_api as _target

for _name in dir(_target):
    if not _name.startswith('__'):
        globals()[_name] = getattr(_target, _name)
