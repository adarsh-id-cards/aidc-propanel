"""
IDCard Table Service Compatibility Shim
========================================
Relocated to `tables.services.table_service`.
Maintained here for 100% zero-regression backward compatibility.
"""

from tables.services import table_service as _target

for _name in dir(_target):
    if not _name.startswith('__'):
        globals()[_name] = getattr(_target, _name)
