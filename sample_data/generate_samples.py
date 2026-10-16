"""Script to generate realistic test workbooks for ExcelMind AI testing and evaluation.
Generates:
1. sample_data/sales_demo.xlsx
2. sample_data/students_demo.xlsx
3. sample_data/messy_headers.xlsx
4. sample_data/messy_quality.xlsx
"""

import os
from datetime import datetime, date
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment

os.makedirs("sample_data", exist_ok=True)

# 1. sales_demo.xlsx
wb_sales = openpyxl.Workbook()
ws_sales = wb_sales.active
ws_sales.title = "Orders"

sales_headers = [
    "Order ID", "Order Date", "Region", "Category", "Sub-Category",
    "Customer Segment", "Quantity", "Unit Price", "Sales", "Discount", "Profit"
]
ws_sales.append(sales_headers)

sales_data = [
    ["ORD-1001", date(2023, 1, 15), "North", "Electronics", "Phones", "Corporate", 4, 350.00, 1400.00, 0.05, 280.00],
    ["ORD-1002", date(2023, 1, 18), "South", "Furniture", "Chairs", "Consumer", 2, 120.00, 240.00, 0.0, 48.00],
    ["ORD-1003", date(2023, 2, 5), "East", "Office Supplies", "Paper", "Corporate", 10, 15.00, 150.00, 0.10, 30.00],
    ["ORD-1004", date(2023, 2, 20), "West", "Electronics", "Laptops", "Small Business", 3, 800.00, 2400.00, 0.05, 480.00],
    ["ORD-1005", date(2023, 3, 12), "North", "Electronics", "Accessories", "Consumer", 8, 25.00, 200.00, 0.0, 60.00],
    ["ORD-1006", date(2023, 3, 28), "South", "Furniture", "Tables", "Corporate", 1, 450.00, 450.00, 0.15, 67.50],
    ["ORD-1007", date(2023, 4, 10), "East", "Office Supplies", "Storage", "Consumer", 5, 40.00, 200.00, 0.0, 40.00],
    ["ORD-1008", date(2023, 4, 25), "West", "Furniture", "Chairs", "Corporate", 4, 120.00, 480.00, 0.10, 96.00],
    ["ORD-1009", date(2023, 5, 2), "North", "Office Supplies", "Binders", "Small Business", 12, 8.50, 102.00, 0.0, 25.50],
    ["ORD-1010", date(2023, 5, 19), "South", "Electronics", "Phones", "Corporate", 5, 400.00, 2000.00, 0.10, 400.00],
    ["ORD-1011", date(2023, 6, 8), "East", "Electronics", "Laptops", "Consumer", 2, 850.00, 1700.00, 0.05, 340.00],
    ["ORD-1012", date(2023, 6, 22), "West", "Office Supplies", "Paper", "Corporate", 15, 15.00, 225.00, 0.0, 45.00],
    ["ORD-1013", date(2023, 7, 4), "North", "Furniture", "Bookcases", "Small Business", 2, 280.00, 560.00, 0.10, 84.00],
    ["ORD-1014", date(2023, 7, 19), "South", "Office Supplies", "Art", "Consumer", 6, 18.00, 108.00, 0.0, 21.60],
    ["ORD-1015", date(2023, 8, 11), "East", "Furniture", "Furnishings", "Corporate", 3, 90.00, 270.00, 0.05, 54.00],
    ["ORD-1016", date(2023, 8, 29), "West", "Electronics", "Accessories", "Consumer", 7, 30.00, 210.00, 0.0, 63.00],
    ["ORD-1017", date(2023, 9, 14), "North", "Electronics", "Phones", "Corporate", 6, 380.00, 2280.00, 0.10, 456.00],
    ["ORD-1018", date(2023, 9, 30), "South", "Furniture", "Chairs", "Small Business", 4, 125.00, 500.00, 0.0, 100.00],
    ["ORD-1019", date(2023, 10, 15), "East", "Office Supplies", "Appliances", "Corporate", 2, 210.00, 420.00, 0.05, 84.00],
    ["ORD-1020", date(2023, 10, 27), "West", "Electronics", "Laptops", "Consumer", 1, 950.00, 950.00, 0.0, 190.00],
    ["ORD-1021", date(2023, 11, 11), "North", "Office Supplies", "Paper", "Corporate", 20, 14.00, 280.00, 0.10, 56.00],
    ["ORD-1022", date(2023, 11, 25), "South", "Electronics", "Accessories", "Corporate", 10, 22.00, 220.00, 0.0, 66.00],
    ["ORD-1023", date(2023, 12, 5), "East", "Furniture", "Tables", "Small Business", 2, 420.00, 840.00, 0.15, 126.00],
    ["ORD-1024", date(2023, 12, 20), "West", "Office Supplies", "Fasteners", "Consumer", 15, 5.00, 75.00, 0.0, 15.00],
    ["ORD-1025", date(2024, 1, 10), "North", "Electronics", "Phones", "Corporate", 5, 420.00, 2100.00, 0.05, 420.00],
    ["ORD-1026", date(2024, 1, 22), "South", "Furniture", "Bookcases", "Consumer", 3, 310.00, 930.00, 0.10, 139.50],
    ["ORD-1027", date(2024, 2, 14), "East", "Electronics", "Laptops", "Small Business", 4, 890.00, 3560.00, 0.10, 712.00],
    ["ORD-1028", date(2024, 2, 28), "West", "Office Supplies", "Storage", "Corporate", 8, 45.00, 360.00, 0.0, 72.00],
    ["ORD-1029", date(2024, 3, 15), "North", "Furniture", "Chairs", "Corporate", 6, 130.00, 780.00, 0.05, 156.00],
    ["ORD-1030", date(2024, 3, 29), "South", "Electronics", "Accessories", "Consumer", 9, 28.00, 252.00, 0.0, 75.60],
]
for row in sales_data:
    ws_sales.append(row)

# Add Returns sheet to test multi-sheet workbooks
ws_returns = wb_sales.create_sheet(title="Returns")
ws_returns.append(["Order ID", "Return Reason", "Returned Date"])
ws_returns.append(["ORD-1002", "Defective", date(2023, 1, 25)])
ws_returns.append(["ORD-1007", "Wrong Item", date(2023, 4, 15)])
ws_returns.append(["ORD-1014", "Damaged", date(2023, 7, 28)])
wb_sales.save("sample_data/sales_demo.xlsx")

# 2. students_demo.xlsx
wb_stu = openpyxl.Workbook()
ws_stu = wb_stu.active
ws_stu.title = "Students"

stu_headers = [
    "Student ID", "Name", "Department", "Gender", "Semester",
    "CGPA", "Attendance Rate", "Placement Status", "Company", "Salary LPA", "City"
]
ws_stu.append(stu_headers)

stu_rows = [
    ["STU-001", "Aarav Sharma", "CSE", "Male", 8, 9.4, "92%", "Placed", "Google", 32.5, "Bengaluru"],
    ["STU-002", "Diya Patel", "CSE", "Female", 8, 8.8, "88%", "Placed", "Microsoft", 28.0, "Hyderabad"],
    ["STU-003", "Rohan Mehta", "ECE", "Male", 8, 7.9, "81%", "Placed", "Qualcomm", 18.5, "Bengaluru"],
    ["STU-004", "Ananya Reddy", "IT", "Female", 8, 9.1, "95%", "Placed", "Amazon", 24.0, "Hyderabad"],
    ["STU-005", "Vikram Singh", "MECH", "Male", 8, 7.2, "78%", "Placed", "Tata Motors", 9.5, "Pune"],
    ["STU-006", "Sneha Nair", "CSE", "Female", 8, 8.5, "86%", "Placed", "Adobe", 22.0, "Noida"],
    ["STU-007", "Karthik Iyer", "ECE", "Male", 8, 6.8, "72%", "Not Placed", "-", 0.0, "Chennai"],
    ["STU-008", "Pooja Verma", "CIVIL", "Female", 8, 7.5, "84%", "Placed", "L&T", 8.0, "Mumbai"],
    ["STU-009", "Arjun Das", "IT", "Male", 8, 8.2, "80%", "Placed", "Cisco", 16.0, "Bengaluru"],
    ["STU-010", "Meera Joshi", "CSE", "Female", 8, 9.6, "96%", "Placed", "Apple", 36.0, "Hyderabad"],
    ["STU-011", "Rahul Gupta", "MECH", "Male", 8, 6.5, "70%", "Not Placed", "-", 0.0, "Delhi"],
    ["STU-012", "Ishita Bose", "ECE", "Female", 8, 8.4, "89%", "Placed", "Intel", 17.5, "Bengaluru"],
    ["STU-013", "Siddharth Rao", "CSE", "Male", 8, 7.8, "83%", "Placed", "Infosys", 7.0, "Pune"],
    ["STU-014", "Kavya Menon", "IT", "Female", 8, 8.9, "91%", "Placed", "Goldman Sachs", 26.0, "Bengaluru"],
    ["STU-015", "Aditya Kulkarni", "CIVIL", "Male", 8, 7.1, "75%", "Not Placed", "-", 0.0, "Mumbai"],
    ["STU-016", "Tanvi Deshmukh", "ECE", "Female", 8, 9.0, "93%", "Placed", "Texas Instruments", 20.0, "Bengaluru"],
    ["STU-017", "Gaurav Malhotra", "MECH", "Male", 8, 8.0, "85%", "Placed", "Mahindra", 10.0, "Chennai"],
    ["STU-018", "Riya Sen", "CSE", "Female", 8, 8.1, "87%", "Placed", "TCS", 7.5, "Kolkata"],
    ["STU-019", "Nikhil Pillai", "IT", "Male", 8, 7.4, "76%", "Placed", "Wipro", 6.5, "Kochi"],
    ["STU-020", "Priya Nambiar", "ECE", "Female", 8, 8.7, "90%", "Placed", "Samsung", 19.0, "Noida"],
]
for row in stu_rows:
    ws_stu.append(row)
wb_stu.save("sample_data/students_demo.xlsx")

# 3. messy_headers.xlsx
# Rule: header is on row 4! Rows 1-3 have titles/metadata. Merged header cells. Merged data cells. Currency strings.
wb_messy_h = openpyxl.Workbook()
ws_messy_h = wb_messy_h.active
ws_messy_h.title = "Financials"

# Row 1: Banner title
ws_messy_h.cell(row=1, column=1, value="ACME CORP - QUARTERLY BRANCH PERFORMANCE REPORT")
# Row 2: Generated metadata
ws_messy_h.cell(row=2, column=1, value="Report Generated: October 2023 | Confidential")
# Row 3: Blank row

# Row 4: Real table headers! With merged header cells and currency/percent symbols in strings
ws_messy_h.cell(row=4, column=1, value="Branch Code")
ws_messy_h.cell(row=4, column=2, value="City")
ws_messy_h.cell(row=4, column=3, value="Region")
ws_messy_h.cell(row=4, column=4, value="Revenue (USD)")
ws_messy_h.cell(row=4, column=5, value="Expenses (USD)")
ws_messy_h.cell(row=4, column=6, value="Target Met %")
ws_messy_h.cell(row=4, column=7, value="Net Profit")

# Merged cells in row 1: A1:G1
ws_messy_h.merge_cells("A1:G1")

# Rows 5+: data rows with messy currencies: "$1,250.00", "₹ 45,000", "(€500)"
messy_rows = [
    ["BR-101", "New York", "East", "$120,500.00", "$95,000.00", "112.5%", "$25,500.00"],
    ["BR-102", "Boston", "East", "$85,200.00", "$70,100.00", "98.0%", "$15,100.00"],
    ["BR-103", "Chicago", "Midwest", "$105,400.00", "$92,000.00", "104.2%", "$13,400.00"],
    ["BR-104", "Detroit", "Midwest", "$62,000.00", "$68,500.00", "84.5%", "($6,500.00)"],
    ["BR-105", "San Francisco", "West", "$180,000.00", "$140,000.00", "125.0%", "$40,000.00"],
    ["BR-106", "Seattle", "West", "$135,000.00", "$110,000.00", "108.0%", "$25,000.00"],
    ["BR-107", "Austin", "South", "$98,000.00", "$80,000.00", "101.5%", "$18,000.00"],
    ["BR-108", "Atlanta", "South", "$90,500.00", "$94,000.00", "89.0%", "($3,500.00)"],
    ["BR-109", "Denver", "West", "$76,000.00", "$64,000.00", "95.0%", "$12,000.00"],
    ["BR-110", "Miami", "South", "$115,000.00", "$90,000.00", "115.0%", "$25,000.00"],
]
for r_idx, r in enumerate(messy_rows, start=5):
    for c_idx, val in enumerate(r, start=1):
        ws_messy_h.cell(row=r_idx, column=c_idx, value=val)

# Add a merged data cell to test forward-fill/fill-down
# Merge Region column for rows 5 and 6 (East)
ws_messy_h.merge_cells("C5:C6")
wb_messy_h.save("sample_data/messy_headers.xlsx")

# 4. messy_quality.xlsx
# Injected issues: duplicates, blanks vs zeros, mixed types, ambiguous dates, outliers
wb_quality = openpyxl.Workbook()
ws_quality = wb_quality.active
ws_quality.title = "QualityAudit"

ws_quality.append(["Record ID", "Transaction Date", "Customer Type", "Units Sold", "Discount Code", "Revenue", "Rating"])

quality_data = [
    # Normal rows
    ["TX-101", "15/01/2023", "Retail", 10, "DISC10", 1000.0, 4.5],
    ["TX-102", "18/01/2023", "Wholesale", 50, "NONE", 4500.0, 4.0],
    ["TX-103", "05/02/2023", "Retail", 5, "DISC5", 500.0, 3.5],
    # Zero vs blank (critical):
    ["TX-104", "12/02/2023", "Retail", 0, "NONE", 0.0, 2.0],        # Real zero!
    ["TX-105", "20/02/2023", "Corporate", None, "DISC20", None, None], # Real missing!
    ["TX-106", "25/02/2023", "Corporate", "N/A", "-", "null", "--"], # Missing strings
    # Mixed types in Units Sold and Revenue:
    ["TX-107", "02/03/2023", "Retail", "Pending", "DISC10", "Unknown", 4.0],
    ["TX-108", "10/03/2023", "Wholesale", 40, "NONE", 3600.0, 5.0],
    # Duplicated row (exact duplicate of TX-102):
    ["TX-102", "18/01/2023", "Wholesale", 50, "NONE", 4500.0, 4.0],
    # Outlier: Revenue 150,000.0 when median is ~1,000
    ["TX-109", "15/03/2023", "Retail", 12, "NONE", 150000.0, 4.8],
    # Ambiguous date format (03/04/2023 could be Mar 4 or Apr 3)
    ["TX-110", "03/04/2023", "Retail", 8, "DISC5", 800.0, 3.0],
    ["TX-111", "04/05/2023", "Corporate", 15, "DISC15", 1500.0, 4.2],
    # Unambiguous date with day > 12:
    ["TX-112", "27/05/2023", "Wholesale", 30, "NONE", 2700.0, 4.6],
    ["TX-113", "08/06/2023", "Retail", 6, "NONE", 600.0, 3.8],
    ["TX-114", "14/06/2023", "Corporate", 22, "DISC10", 2200.0, 4.1],
]
for r in quality_data:
    ws_quality.append(r)

wb_quality.save("sample_data/messy_quality.xlsx")
print("Successfully generated all 4 sample workbooks in sample_data/!")
