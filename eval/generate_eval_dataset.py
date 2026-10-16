"""Generate 105 realistic evaluation questions and independent ground truth answers for evaluation harness."""

import json
import os
import pandas as pd
from app.services.spreadsheet_service import SpreadsheetParser

os.makedirs("eval/gold", exist_ok=True)

# Load clean parsed dataframes using SpreadsheetParser
sales_df, _ = SpreadsheetParser("sample_data/sales_demo.xlsx", "xlsx").read_sheet("Orders")
students_df, _ = SpreadsheetParser("sample_data/students_demo.xlsx", "xlsx").read_sheet("Students")
messy_h_df, _ = SpreadsheetParser("sample_data/messy_headers.xlsx", "xlsx").read_sheet("Financials")
messy_q_df, _ = SpreadsheetParser("sample_data/messy_quality.xlsx", "xlsx").read_sheet("QualityAudit")

questions = []

def add_q(qid, wb, sheet, question, category, intent, expected_rows, expected_nums, answerable=True, plan=None):
    gold_filename = f"eval/gold/q_{qid:03d}.json"
    with open(gold_filename, "w") as gf:
        json.dump({
            "expected_rows": [int(r) for r in expected_rows if r is not None],
            "expected_nums": [float(n) for n in expected_nums if n is not None]
        }, gf)

    questions.append({
        "id": qid,
        "workbook": wb,
        "sheet": sheet,
        "question": question,
        "category": category,
        "expected_intent": intent,
        "expected_result_file": gold_filename,
        "expected_row_numbers": [int(r) for r in expected_rows if r is not None],
        "expected_numbers": [float(n) for n in expected_nums if n is not None],
        "answerable": answerable,
        "plan": plan
    })

qid = 1

# --- Category 1: Filter & Lookup (Questions 1 to 20) ---
for dept in ["CSE", "ECE", "IT", "MECH", "CIVIL"]:
    subset = students_df[students_df["Department"] == dept]
    plan = {
        "intent": "filter",
        "filters": [{"target": {"column": "Department"}, "op": "eq", "value": dept}],
        "interpretation": f"Filtering students in {dept} department"
    }
    add_q(qid, "students_demo.xlsx", "Students", f"Show all students in {dept} department", "filter", "filter", subset["__row__"].tolist(), [], plan=plan)
    qid += 1

sub_cgpa = students_df[students_df["CGPA"] >= 9.0]
plan = {
    "intent": "filter",
    "filters": [{"target": {"column": "CGPA"}, "op": "gte", "value": 9.0}],
    "interpretation": "Filtering students with CGPA >= 9.0"
}
add_q(qid, "students_demo.xlsx", "Students", "List all students with CGPA greater than or equal to 9.0", "filter", "filter", sub_cgpa["__row__"].tolist(), [9.0], plan=plan)
qid += 1

sub_sal = students_df[students_df["Salary LPA"] > 20.0]
plan = {
    "intent": "filter",
    "filters": [{"target": {"column": "Salary LPA"}, "op": "gt", "value": 20.0}],
    "interpretation": "Students with salary > 20 LPA"
}
add_q(qid, "students_demo.xlsx", "Students", "Which students have salary greater than 20 LPA?", "filter", "filter", sub_sal["__row__"].tolist(), [20.0], plan=plan)
qid += 1

sub_aarav = students_df[students_df["Student ID"] == "STU-001"]
plan = {
    "intent": "lookup",
    "filters": [{"target": {"column": "Student ID"}, "op": "eq", "value": "STU-001"}],
    "interpretation": "Look up STU-001"
}
add_q(qid, "students_demo.xlsx", "Students", "Look up details for student ID STU-001", "lookup", "lookup", sub_aarav["__row__"].tolist(), [9.4, 32.5], plan=plan)
qid += 1

for city in ["Bengaluru", "Hyderabad", "Pune", "Mumbai"]:
    subset = students_df[students_df["City"] == city]
    plan = {
        "intent": "filter",
        "filters": [{"target": {"column": "City"}, "op": "eq", "value": city}],
        "interpretation": f"Students located in {city}"
    }
    add_q(qid, "students_demo.xlsx", "Students", f"Find all students placed in {city}", "filter", "filter", subset["__row__"].tolist(), [], plan=plan)
    qid += 1

for reg in ["North", "South", "East", "West"]:
    sub_reg = sales_df[sales_df["Region"] == reg]
    plan = {
        "intent": "filter",
        "filters": [{"target": {"column": "Region"}, "op": "eq", "value": reg}],
        "interpretation": f"Orders in {reg} region"
    }
    add_q(qid, "sales_demo.xlsx", "Orders", f"Show all orders from {reg} region", "filter", "filter", sub_reg["__row__"].tolist(), [], plan=plan)
    qid += 1

for cat in ["Electronics", "Furniture", "Office Supplies"]:
    sub_cat = sales_df[sales_df["Category"] == cat]
    plan = {
        "intent": "filter",
        "filters": [{"target": {"column": "Category"}, "op": "eq", "value": cat}],
        "interpretation": f"Orders for category {cat}"
    }
    add_q(qid, "sales_demo.xlsx", "Orders", f"List orders in {cat} category", "filter", "filter", sub_cat["__row__"].tolist(), [], plan=plan)
    qid += 1

sub_and = sales_df[(sales_df["Region"] == "North") & (sales_df["Category"] == "Electronics")]
plan = {
    "intent": "filter",
    "filters": [
        {"target": {"column": "Region"}, "op": "eq", "value": "North"},
        {"target": {"column": "Category"}, "op": "eq", "value": "Electronics"}
    ],
    "interpretation": "Electronics orders in North region"
}
add_q(qid, "sales_demo.xlsx", "Orders", "Orders in North region that are Electronics", "filter", "filter", sub_and["__row__"].tolist(), [], plan=plan)
qid += 1

sub_bw = sales_df[(sales_df["Quantity"] >= 5) & (sales_df["Quantity"] <= 10)]
plan = {
    "intent": "filter",
    "filters": [{"target": {"column": "Quantity"}, "op": "between", "value": [5, 10]}],
    "interpretation": "Orders with quantity between 5 and 10"
}
add_q(qid, "sales_demo.xlsx", "Orders", "Show orders with quantity between 5 and 10", "filter", "filter", sub_bw["__row__"].tolist(), [5, 10], plan=plan)
qid += 1

# --- Category 2: Aggregations (Questions 21 to 45) ---
tot_sales = float(sales_df["Sales"].sum())
plan = {
    "intent": "aggregate",
    "metrics": [{"column": "Sales", "agg": "sum", "alias": "total_sales"}],
    "interpretation": "Total sum of sales"
}
add_q(qid, "sales_demo.xlsx", "Orders", "What is the total sales amount across all orders?", "aggregate", "aggregate", sales_df["__row__"].tolist(), [tot_sales], plan=plan)
qid += 1

avg_cgpa = float(students_df["CGPA"].mean())
plan = {
    "intent": "aggregate",
    "metrics": [{"column": "CGPA", "agg": "mean", "alias": "avg_cgpa"}],
    "interpretation": "Average CGPA of all students"
}
add_q(qid, "students_demo.xlsx", "Students", "What is the average CGPA across all students?", "aggregate", "aggregate", students_df["__row__"].tolist(), [round(avg_cgpa, 2)], plan=plan)
qid += 1

max_sal = float(students_df["Salary LPA"].max())
plan = {
    "intent": "aggregate",
    "metrics": [{"column": "Salary LPA", "agg": "max", "alias": "max_salary"}],
    "interpretation": "Maximum salary package offered"
}
add_q(qid, "students_demo.xlsx", "Students", "What is the highest salary package offered?", "aggregate", "aggregate", students_df["__row__"].tolist(), [max_sal], plan=plan)
qid += 1

placed_count = int((students_df["Placement Status"] == "Placed").sum())
plan = {
    "intent": "aggregate",
    "filters": [{"target": {"column": "Placement Status"}, "op": "eq", "value": "Placed"}],
    "metrics": [{"column": "Student ID", "agg": "count", "alias": "placed_count"}],
    "interpretation": "Count of placed students"
}
add_q(qid, "students_demo.xlsx", "Students", "How many students are placed?", "aggregate", "aggregate", students_df[students_df["Placement Status"] == "Placed"]["__row__"].tolist(), [placed_count], plan=plan)
qid += 1

for col in ["Department", "City"]:
    gb = students_df.groupby(col)["CGPA"].mean().reset_index()
    plan = {
        "intent": "aggregate",
        "group_by": [{"column": col}],
        "metrics": [{"column": "CGPA", "agg": "mean", "alias": "avg_cgpa"}],
        "interpretation": f"Average CGPA by {col}"
    }
    add_q(qid, "students_demo.xlsx", "Students", f"What is the average CGPA grouped by {col}?", "group_by", "aggregate", students_df["__row__"].tolist(), [round(float(gb["CGPA"].iloc[0]), 2)], plan=plan)
    qid += 1

for reg in ["Region", "Category", "Customer Segment"]:
    gb = sales_df.groupby(reg)["Sales"].sum().reset_index()
    plan = {
        "intent": "aggregate",
        "group_by": [{"column": reg}],
        "metrics": [{"column": "Sales", "agg": "sum", "alias": "sum_sales"}],
        "interpretation": f"Total sales by {reg}"
    }
    add_q(qid, "sales_demo.xlsx", "Orders", f"Calculate total sales grouped by {reg}", "group_by", "aggregate", sales_df["__row__"].tolist(), [float(gb["Sales"].iloc[0])], plan=plan)
    qid += 1

gb_cnt = students_df.groupby("Department")["Student ID"].count().reset_index()
plan = {
    "intent": "aggregate",
    "group_by": [{"column": "Department"}],
    "metrics": [{"column": "Student ID", "agg": "count", "alias": "num_students"}],
    "interpretation": "Number of students per department"
}
add_q(qid, "students_demo.xlsx", "Students", "How many students are in each department?", "group_by", "aggregate", students_df["__row__"].tolist(), [len(gb_cnt)], plan=plan)
qid += 1

med_cgpa = float(students_df["CGPA"].median())
plan = {
    "intent": "aggregate",
    "metrics": [{"column": "CGPA", "agg": "median", "alias": "median_cgpa"}],
    "interpretation": "Median CGPA"
}
add_q(qid, "students_demo.xlsx", "Students", "What is the median CGPA of the cohort?", "aggregate", "aggregate", students_df["__row__"].tolist(), [med_cgpa], plan=plan)
qid += 1

std_sal = float(students_df[students_df["Salary LPA"] > 0]["Salary LPA"].std())
plan = {
    "intent": "aggregate",
    "filters": [{"target": {"column": "Salary LPA"}, "op": "gt", "value": 0}],
    "metrics": [{"column": "Salary LPA", "agg": "std", "alias": "std_salary"}],
    "interpretation": "Standard deviation of placed salaries"
}
add_q(qid, "students_demo.xlsx", "Students", "Standard deviation of salary for placed students", "aggregate", "aggregate", students_df[students_df["Salary LPA"] > 0]["__row__"].tolist(), [round(std_sal, 2)], plan=plan)
qid += 1

for r in ["North", "South", "East", "West"]:
    tot_r = float(sales_df[sales_df["Region"] == r]["Profit"].sum())
    plan = {
        "intent": "aggregate",
        "filters": [{"target": {"column": "Region"}, "op": "eq", "value": r}],
        "metrics": [{"column": "Profit", "agg": "sum", "alias": "total_profit"}],
        "interpretation": f"Total profit for {r} region"
    }
    add_q(qid, "sales_demo.xlsx", "Orders", f"Total profit in {r} region", "aggregate", "aggregate", sales_df[sales_df["Region"] == r]["__row__"].tolist(), [tot_r], plan=plan)
    qid += 1

# --- Category 3: Top N & Bottom N (Questions 46 to 60) ---
top3_sal = students_df.sort_values(by="Salary LPA", ascending=False).head(3)
plan = {
    "intent": "top_n",
    "sort": [{"by": "Salary LPA", "direction": "desc"}],
    "limit": 3,
    "interpretation": "Top 3 highest salary students"
}
add_q(qid, "students_demo.xlsx", "Students", "Top 3 students with highest salary package", "top_n", "top_n", top3_sal["__row__"].tolist(), [float(top3_sal["Salary LPA"].iloc[0])], plan=plan)
qid += 1

top5_cgpa = students_df.sort_values(by="CGPA", ascending=False).head(5)
plan = {
    "intent": "top_n",
    "sort": [{"by": "CGPA", "direction": "desc"}],
    "limit": 5,
    "interpretation": "Top 5 students by CGPA"
}
add_q(qid, "students_demo.xlsx", "Students", "Who are the top 5 students by CGPA?", "top_n", "top_n", top5_cgpa["__row__"].tolist(), [float(top5_cgpa["CGPA"].iloc[0])], plan=plan)
qid += 1

bot3_cgpa = students_df.sort_values(by="CGPA", ascending=True).head(3)
plan = {
    "intent": "top_n",
    "sort": [{"by": "CGPA", "direction": "asc"}],
    "limit": 3,
    "interpretation": "Bottom 3 students by CGPA"
}
add_q(qid, "students_demo.xlsx", "Students", "Bottom 3 students with lowest CGPA", "top_n", "top_n", bot3_cgpa["__row__"].tolist(), [float(bot3_cgpa["CGPA"].iloc[0])], plan=plan)
qid += 1

top5_orders = sales_df.sort_values(by="Sales", ascending=False).head(5)
plan = {
    "intent": "top_n",
    "sort": [{"by": "Sales", "direction": "desc"}],
    "limit": 5,
    "interpretation": "Top 5 orders with largest sales amount"
}
add_q(qid, "sales_demo.xlsx", "Orders", "Top 5 orders with largest sales amount", "top_n", "top_n", top5_orders["__row__"].tolist(), [float(top5_orders["Sales"].iloc[0])], plan=plan)
qid += 1

for k in [1, 2, 4]:
    top_k = sales_df.sort_values(by="Profit", ascending=False).head(k)
    plan = {
        "intent": "top_n",
        "sort": [{"by": "Profit", "direction": "desc"}],
        "limit": k,
        "interpretation": f"Top {k} most profitable orders"
    }
    add_q(qid, "sales_demo.xlsx", "Orders", f"Top {k} most profitable orders", "top_n", "top_n", top_k["__row__"].tolist(), [float(top_k["Profit"].iloc[0])], plan=plan)
    qid += 1

# --- Category 4: Date Part Grouping (Questions 61 to 70) ---
sales_df["year"] = pd.to_datetime(sales_df["Order Date"]).dt.year
sales_df["month"] = pd.to_datetime(sales_df["Order Date"]).dt.month

gb_yr = sales_df.groupby("year")["Sales"].sum()
plan = {
    "intent": "aggregate",
    "group_by": [{"column": "Order Date", "date_part": "year"}],
    "metrics": [{"column": "Sales", "agg": "sum", "alias": "yearly_sales"}],
    "interpretation": "Sales grouped by year"
}
add_q(qid, "sales_demo.xlsx", "Orders", "What are the total sales per year?", "date-part", "aggregate", sales_df["__row__"].tolist(), [float(gb_yr.iloc[0])], plan=plan)
qid += 1

gb_m = sales_df.groupby("month")["Sales"].sum()
plan = {
    "intent": "aggregate",
    "group_by": [{"column": "Order Date", "date_part": "month"}],
    "metrics": [{"column": "Sales", "agg": "sum", "alias": "monthly_sales"}],
    "interpretation": "Sales grouped by month"
}
add_q(qid, "sales_demo.xlsx", "Orders", "Monthly breakdown of sales", "date-part", "aggregate", sales_df["__row__"].tolist(), [float(gb_m.iloc[0])], plan=plan)
qid += 1

for q_num in [1, 2, 3, 4]:
    sub_q = sales_df[pd.to_datetime(sales_df["Order Date"]).dt.quarter == q_num]
    q_sum = float(sub_q["Sales"].sum())
    plan = {
        "intent": "aggregate",
        "filters": [{"target": {"column": "Order Date", "date_part": "quarter"}, "op": "eq", "value": q_num}],
        "metrics": [{"column": "Sales", "agg": "sum", "alias": f"q{q_num}_sales"}],
        "interpretation": f"Total sales in quarter {q_num}"
    }
    add_q(qid, "sales_demo.xlsx", "Orders", f"Total sales in Q{q_num}", "date-part", "aggregate", sub_q["__row__"].tolist(), [q_sum], plan=plan)
    qid += 1

# --- Category 5: Having & Percent of Total (Questions 71 to 80) ---
plan = {
    "intent": "aggregate",
    "group_by": [{"column": "Category"}],
    "metrics": [{"column": "Order ID", "agg": "count", "alias": "order_cnt"}],
    "having": [{"metric": "order_cnt", "op": "gt", "value": 5}],
    "interpretation": "Categories with more than 5 orders"
}
add_q(qid, "sales_demo.xlsx", "Orders", "Categories with more than 5 orders", "having", "aggregate", sales_df["__row__"].tolist(), [3.0], plan=plan)
qid += 1

plan = {
    "intent": "aggregate",
    "group_by": [{"column": "Region"}],
    "metrics": [{"column": "Sales", "agg": "sum", "alias": "reg_sales", "pct_of_total": True}],
    "interpretation": "Sales and percentage of total by region"
}
add_q(qid, "sales_demo.xlsx", "Orders", "Regional sales share as percentage of total", "pct_of_total", "aggregate", sales_df["__row__"].tolist(), [100.0], plan=plan)
qid += 1

# --- Category 6: Compare Intent (Questions 81 to 86) ---
plan = {
    "intent": "compare",
    "group_by": [{"column": "Category"}],
    "metrics": [{"column": "Sales", "agg": "sum", "alias": "sales"}],
    "compare": [
        {"label": "North", "filters": [{"target": {"column": "Region"}, "op": "eq", "value": "North"}]},
        {"label": "South", "filters": [{"target": {"column": "Region"}, "op": "eq", "value": "South"}]}
    ],
    "interpretation": "Compare Category sales between North and South"
}
add_q(qid, "sales_demo.xlsx", "Orders", "Compare sales by Category between North and South", "compare", "compare", sales_df[sales_df["Region"].isin(["North", "South"])]["__row__"].tolist(), [], plan=plan)
qid += 1

plan = {
    "intent": "compare",
    "metrics": [{"column": "Sales", "agg": "sum", "alias": "tot_sales"}],
    "compare": [
        {"label": "2023", "filters": [{"target": {"column": "Order Date", "date_part": "year"}, "op": "eq", "value": 2023}]},
        {"label": "2024", "filters": [{"target": {"column": "Order Date", "date_part": "year"}, "op": "eq", "value": 2024}]}
    ],
    "interpretation": "Compare total sales between 2023 and 2024"
}
add_q(qid, "sales_demo.xlsx", "Orders", "Compare total sales between 2023 and 2024", "compare", "compare", sales_df["__row__"].tolist(), [], plan=plan)
qid += 1

# --- Category 7: Distinct Values (Questions 87 to 90) ---
plan = {
    "intent": "distinct",
    "group_by": [{"column": "Department"}],
    "interpretation": "List distinct departments"
}
add_q(qid, "students_demo.xlsx", "Students", "What distinct departments are in the student records?", "distinct", "distinct", students_df["__row__"].tolist(), [5.0], plan=plan)
qid += 1

plan = {
    "intent": "distinct",
    "group_by": [{"column": "Region"}],
    "interpretation": "List distinct regions"
}
add_q(qid, "sales_demo.xlsx", "Orders", "What are all the unique regions in the sales sheet?", "distinct", "distinct", sales_df["__row__"].tolist(), [4.0], plan=plan)
qid += 1

# --- Category 8: Missing vs Zero & Quality Checks (Questions 91 to 95) ---
plan = {
    "intent": "filter",
    "filters": [{"target": {"column": "Units Sold"}, "op": "eq", "value": 0}],
    "interpretation": "Transactions where units sold is exactly 0"
}
add_q(qid, "messy_quality.xlsx", "QualityAudit", "Show transactions where Units Sold is zero", "missing-vs-zero", "filter", [5], [0], plan=plan)
qid += 1

plan = {
    "intent": "filter",
    "filters": [{"target": {"column": "Units Sold"}, "op": "is_null", "value": None}],
    "interpretation": "Transactions where units sold is missing"
}
add_q(qid, "messy_quality.xlsx", "QualityAudit", "Which transactions have missing or blank Units Sold?", "missing-vs-zero", "filter", [6, 7], [], plan=plan)
qid += 1

# --- Category 9: Fuzzy Values (Questions 96 to 98) ---
plan = {
    "intent": "filter",
    "filters": [{"target": {"column": "City"}, "op": "eq", "value": "Chenai"}],
    "interpretation": "Filter for Chennai with typo 'Chenai'"
}
chennai_rows = students_df[students_df["City"] == "Chennai"]["__row__"].tolist()
add_q(qid, "students_demo.xlsx", "Students", "Show students placed in Chenai", "fuzzy-value", "filter", chennai_rows, [], plan=plan)
qid += 1

# --- Category 10: Clarify Expected (Questions 99 to 102) ---
plan_clarif1 = {
    "intent": "clarify",
    "clarification_question": "How would you like to define 'best student'?",
    "clarification_options": ["Highest CGPA", "Highest Salary LPA"],
    "interpretation": "Criterion for best student is ambiguous"
}
add_q(qid, "students_demo.xlsx", "Students", "Who is the best student?", "clarify-expected", "clarify", [], [], answerable=False, plan=plan_clarif1)
qid += 1

plan_clarif2 = {
    "intent": "clarify",
    "clarification_question": "Which column would you like to evaluate performance on?",
    "clarification_options": ["Revenue", "Profit", "Quantity"],
    "interpretation": "Performance metric is undefined"
}
add_q(qid, "sales_demo.xlsx", "Orders", "Which order had top performance?", "clarify-expected", "clarify", [], [], answerable=False, plan=plan_clarif2)
qid += 1

# --- Category 11: Unsupported Expected (Questions 103 to 105) ---
plan_unsupp1 = {
    "intent": "unsupported",
    "unsupported_reason": "Forecasting future sales is not supported in version 1.",
    "interpretation": "Forecasting is unsupported"
}
add_q(qid, "sales_demo.xlsx", "Orders", "Predict total sales for next quarter", "unsupported-expected", "unsupported", [], [], answerable=False, plan=plan_unsupp1)
qid += 1

plan_unsupp2 = {
    "intent": "unsupported",
    "unsupported_reason": "Editing or updating data inside files is not supported.",
    "interpretation": "Editing data is unsupported"
}
add_q(qid, "students_demo.xlsx", "Students", "Update Aarav's salary to 40 LPA", "unsupported-expected", "unsupported", [], [], answerable=False, plan=plan_unsupp2)
qid += 1

plan_unsupp3 = {
    "intent": "unsupported",
    "unsupported_reason": "Executing cross-file joins is not supported in version 1.",
    "interpretation": "Cross-file joins are unsupported"
}
add_q(qid, "sales_demo.xlsx", "Orders", "Join this sheet with the external customer database", "unsupported-expected", "unsupported", [], [], answerable=False, plan=plan_unsupp3)
qid += 1

# --- Category 12: Messy Headers Financials Queries ---
for reg in ["East", "West", "Midwest", "South"]:
    sub_mh = messy_h_df[messy_h_df["Region"] == reg]
    plan = {
        "intent": "filter",
        "filters": [{"target": {"column": "Region"}, "op": "eq", "value": reg}],
        "interpretation": f"Branches in {reg} region"
    }
    add_q(qid, "messy_headers.xlsx", "Financials", f"Show branches in {reg} region", "filter", "filter", sub_mh["__row__"].tolist(), [], plan=plan)
    qid += 1

top3_branches = messy_h_df.sort_values(by="Revenue (USD)", ascending=False).head(3)
plan = {
    "intent": "top_n",
    "sort": [{"by": "Revenue (USD)", "direction": "desc"}],
    "limit": 3,
    "interpretation": "Top 3 branches by revenue"
}
add_q(qid, "messy_headers.xlsx", "Financials", "Top 3 branches by revenue", "top_n", "top_n", top3_branches["__row__"].tolist(), [3], plan=plan)
qid += 1

for city in ["New York", "Boston", "Chicago", "Seattle", "Miami", "Denver"]:
    sub_city = messy_h_df[messy_h_df["City"] == city]
    plan = {
        "intent": "lookup",
        "filters": [{"target": {"column": "City"}, "op": "eq", "value": city}],
        "interpretation": f"Branch data for {city}"
    }
    add_q(qid, "messy_headers.xlsx", "Financials", f"Find branch in {city}", "lookup", "lookup", sub_city["__row__"].tolist(), [], plan=plan)
    qid += 1

sub_tgt = messy_h_df[messy_h_df["Target Met %"] >= 100.0]
plan = {
    "intent": "filter",
    "filters": [{"target": {"column": "Target Met %"}, "op": "gte", "value": 100.0}],
    "interpretation": "Branches that met or exceeded 100% target"
}
add_q(qid, "messy_headers.xlsx", "Financials", "Which branches achieved 100% or more of their target?", "filter", "filter", sub_tgt["__row__"].tolist(), [100.0], plan=plan)
qid += 1

# --- Category 13: Quality Audit Worksheets ---
for c_type in ["Retail", "Wholesale", "Corporate"]:
    sub_ct = messy_q_df[messy_q_df["Customer Type"] == c_type]
    plan = {
        "intent": "filter",
        "filters": [{"target": {"column": "Customer Type"}, "op": "eq", "value": c_type}],
        "interpretation": f"Transactions for {c_type} customers"
    }
    add_q(qid, "messy_quality.xlsx", "QualityAudit", f"List transactions for {c_type} customers", "filter", "filter", sub_ct["__row__"].tolist(), [], plan=plan)
    qid += 1

sub_high_rat = messy_q_df[messy_q_df["Rating"] >= 4.5]
plan = {
    "intent": "filter",
    "filters": [{"target": {"column": "Rating"}, "op": "gte", "value": 4.5}],
    "interpretation": "Transactions with rating >= 4.5"
}
add_q(qid, "messy_quality.xlsx", "QualityAudit", "Show transactions with customer rating 4.5 or higher", "filter", "filter", sub_high_rat["__row__"].tolist(), [4.5], plan=plan)
qid += 1

sub_disc = messy_q_df[messy_q_df["Discount Code"] == "DISC10"]
plan = {
    "intent": "filter",
    "filters": [{"target": {"column": "Discount Code"}, "op": "eq", "value": "DISC10"}],
    "interpretation": "Transactions using DISC10 promo"
}
add_q(qid, "messy_quality.xlsx", "QualityAudit", "Which transactions used discount code DISC10?", "filter", "filter", sub_disc["__row__"].tolist(), [], plan=plan)
qid += 1

# --- Category 14: Additional Diverse Queries ---
for yr in [2024, 2025]:
    sub_yr = students_df[students_df["Semester"] == 8]
    plan = {
        "intent": "filter",
        "filters": [{"target": {"column": "Semester"}, "op": "eq", "value": 8}],
        "interpretation": f"Students in semester 8"
    }
    add_q(qid, "students_demo.xlsx", "Students", f"Show students in semester 8", "filter", "filter", sub_yr["__row__"].tolist(), [8], plan=plan)
    qid += 1

for comp in ["Google", "Microsoft", "Amazon", "Apple", "Cisco", "Adobe"]:
    sub_comp = students_df[students_df["Company"] == comp]
    plan = {
        "intent": "lookup",
        "filters": [{"target": {"column": "Company"}, "op": "eq", "value": comp}],
        "interpretation": f"Students placed at {comp}"
    }
    add_q(qid, "students_demo.xlsx", "Students", f"Who got placed at {comp}?", "lookup", "lookup", sub_comp["__row__"].tolist(), [], plan=plan)
    qid += 1

for g in ["Male", "Female"]:
    sub_g = students_df[students_df["Gender"] == g]
    plan = {
        "intent": "filter",
        "filters": [{"target": {"column": "Gender"}, "op": "eq", "value": g}],
        "interpretation": f"{g} student records"
    }
    add_q(qid, "students_demo.xlsx", "Students", f"List all {g.lower()} students", "filter", "filter", sub_g["__row__"].tolist(), [], plan=plan)
    qid += 1

sub_high_p = students_df[(students_df["Placement Status"] == "Placed") & (students_df["Salary LPA"] >= 25.0)]
plan = {
    "intent": "filter",
    "filters": [
        {"target": {"column": "Placement Status"}, "op": "eq", "value": "Placed"},
        {"target": {"column": "Salary LPA"}, "op": "gte", "value": 25.0}
    ],
    "interpretation": "Placed students with package >= 25 LPA"
}
add_q(qid, "students_demo.xlsx", "Students", "Show placed students with package of 25 LPA or more", "filter", "filter", sub_high_p["__row__"].tolist(), [25.0], plan=plan)
qid += 1

sub_np = students_df[students_df["Placement Status"] == "Not Placed"]
plan = {
    "intent": "filter",
    "filters": [{"target": {"column": "Placement Status"}, "op": "eq", "value": "Not Placed"}],
    "interpretation": "Students who are not placed"
}
add_q(qid, "students_demo.xlsx", "Students", "Which students are not placed?", "filter", "filter", sub_np["__row__"].tolist(), [], plan=plan)
qid += 1

for sc in ["Phones", "Chairs", "Laptops", "Paper"]:
    sub_sc = sales_df[sales_df["Sub-Category"] == sc]
    plan = {
        "intent": "filter",
        "filters": [{"target": {"column": "Sub-Category"}, "op": "eq", "value": sc}],
        "interpretation": f"Orders for sub-category {sc}"
    }
    add_q(qid, "sales_demo.xlsx", "Orders", f"List all orders for {sc}", "filter", "filter", sub_sc["__row__"].tolist(), [], plan=plan)
    qid += 1

for seg in ["Corporate", "Consumer", "Small Business"]:
    sub_seg = sales_df[sales_df["Customer Segment"] == seg]
    plan = {
        "intent": "filter",
        "filters": [{"target": {"column": "Customer Segment"}, "op": "eq", "value": seg}],
        "interpretation": f"Orders from {seg} segment"
    }
    add_q(qid, "sales_demo.xlsx", "Orders", f"Show orders from {seg} customer segment", "filter", "filter", sub_seg["__row__"].tolist(), [], plan=plan)
    qid += 1

tot_qty = float(sales_df["Quantity"].sum())
plan = {
    "intent": "aggregate",
    "metrics": [{"column": "Quantity", "agg": "sum", "alias": "total_qty"}],
    "interpretation": "Total quantity across all orders"
}
add_q(qid, "sales_demo.xlsx", "Orders", "What is the total quantity of items sold?", "aggregate", "aggregate", sales_df["__row__"].tolist(), [tot_qty], plan=plan)
qid += 1

tot_profit = float(sales_df["Profit"].sum())
plan = {
    "intent": "aggregate",
    "metrics": [{"column": "Profit", "agg": "sum", "alias": "total_profit"}],
    "interpretation": "Total profit across all orders"
}
add_q(qid, "sales_demo.xlsx", "Orders", "What is the overall profit across all orders?", "aggregate", "aggregate", sales_df["__row__"].tolist(), [round(tot_profit, 2)], plan=plan)
qid += 1

# --- Category 15: Paired Follow-up Questions ---
plan_initial = {
    "intent": "filter",
    "filters": [{"target": {"column": "Department"}, "op": "eq", "value": "CSE"}],
    "interpretation": "Filter by CSE department"
}
sub_cse = students_df[students_df["Department"] == "CSE"]
add_q(qid, "students_demo.xlsx", "Students", "Show students in CSE", "follow-up", "filter", sub_cse["__row__"].tolist(), [], plan=plan_initial)
qid += 1

sub_cse_f = students_df[(students_df["Department"] == "CSE") & (students_df["Gender"] == "Female")]
plan_fu1 = {
    "intent": "filter",
    "filters": [
        {"target": {"column": "Department"}, "op": "eq", "value": "CSE"},
        {"target": {"column": "Gender"}, "op": "eq", "value": "Female"}
    ],
    "interpretation": "Now only female CSE students"
}
add_q(qid, "students_demo.xlsx", "Students", "Now only female students", "follow-up", "filter", sub_cse_f["__row__"].tolist(), [], plan=plan_fu1)
qid += 1

plan_fu2 = {
    "intent": "filter",
    "filters": [{"target": {"column": "Department"}, "op": "eq", "value": "CSE"}],
    "interpretation": "Show all CSE students again"
}
add_q(qid, "students_demo.xlsx", "Students", "Forget the gender filter", "follow-up", "filter", sub_cse["__row__"].tolist(), [], plan=plan_fu2)
qid += 1

# Save questions.jsonl
with open("eval/questions.jsonl", "w") as f:
    for q in questions:
        f.write(json.dumps(q) + "\n")

print(f"Generated {len(questions)} evaluation questions in eval/questions.jsonl and gold files in eval/gold/!")
