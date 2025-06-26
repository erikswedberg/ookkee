package database

import (
	"context"
	"log"
)

func SeedDefaultCategories(ctx context.Context) error {
	// Insert default categories for test user with specified sort order
	_, err := Pool.Exec(ctx, `
		INSERT INTO expense_category (user_id, name, is_personal, sort_order) 
		SELECT '00000000-0000-0000-0000-000000000001', name, false, sort_order
		FROM (VALUES 
			('Gasoline', 1),
			('Meals', 2),
			('Parking', 3),
			('Water', 4),
			('Travel', 5),
			('Computer', 6),
			('Tolls', 7),
			('Payroll', 8),
			('Hosting', 9),
			('Auto Insurance', 10),
			('Renter''s Insurance', 11),
			('Phone', 12),
			('Internet', 13),
			('Rent', 14),
			('Home Improvement', 15),
			('Auto Maintenance', 16),
			('Medical', 17),
			('Tax Prep', 18),
			('Office Supplies', 19),
			('Education/Training', 20),
			('Project Supplies', 21),
			('Postage', 22),
			('Business Filings', 23),
			('Fees', 24),
			('Auto Registration', 25),
			('Gas Utility Bill', 26),
			('Electric', 27),
			('Software', 28)
		) AS categories(name, sort_order)
		WHERE NOT EXISTS (
			SELECT 1 FROM expense_category 
			WHERE user_id = '00000000-0000-0000-0000-000000000001' 
			AND deleted_at IS NULL
		)
	`)
	if err != nil {
		return err
	}

	log.Println("Default categories seeded successfully")
	return nil
}
