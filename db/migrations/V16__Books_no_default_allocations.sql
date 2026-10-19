-- V16__Books_no_default_allocations.sql
-- The owner does not know what business-use percentages the prior preparer
-- used; the books should not assert any. Allowed = gross until the preparer
-- sets percentages (category_allocation stays available for that).
DELETE FROM category_allocation;
