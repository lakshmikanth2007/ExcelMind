"""Spreadsheet Data Modification Service.
Allows AI to update cells, add/delete columns, add/delete rows, and transform data per user instructions.
"""

import os
import re
import logging
import pandas as pd
import numpy as np
from typing import Any, Dict, List, Optional, Tuple
from app.core.config import settings
from app.schemas.profile import SheetProfile
from app.services.llm_service import get_llm_service
from app.services.spreadsheet_service import SpreadsheetParser

logger = logging.getLogger(__name__)

# Action keywords signaling modification intent
MODIFY_KEYWORDS = [
    "update", "set", "change", "modify", "replace",
    "add column", "new column", "create column", "insert column", "calculate column",
    "delete row", "remove row", "drop row", "filter out row",
    "delete column", "remove column", "drop column",
    "rename column", "change column name",
    "add row", "new row", "insert row", "append row", "add student", "add record",
    "fill missing", "fill null", "fill na", "fill blank", "replace null",
    "increase by", "decrease by", "multiply by", "divide by", "add 10%", "subtract"
]

def is_modification_request(question: str) -> bool:
    """Check if the user prompt is an instruction to modify or edit spreadsheet data."""
    q_lower = question.strip().lower()
    return any(kw in q_lower for kw in MODIFY_KEYWORDS)

class DataModifier:
    def __init__(self, file_path: str, file_type: str, sheet_name: str):
        self.file_path = file_path
        self.file_type = file_type.lower().lstrip(".")
        self.sheet_name = sheet_name

    def apply_modification(
        self,
        instruction: str,
        df: pd.DataFrame,
        profile: SheetProfile
    ) -> Tuple[pd.DataFrame, str, bool]:
        """Apply modification instruction to the DataFrame and return (updated_df, summary_message, success)."""
        df_copy = df.copy()
        q_lower = instruction.strip().lower()

        # Step 1: Try fast deterministic rules for common update/rename/add-column patterns
        success, modified_df, summary = self._try_deterministic_rule(q_lower, instruction, df_copy, profile)
        if success and modified_df is not None:
            self._save_dataframe(modified_df)
            return modified_df, summary, True

        # Step 2: Use LLM-assisted Python transformation for complex or freeform instructions
        try:
            llm_df, llm_summary = self._apply_llm_transformation(instruction, df_copy, profile)
            if llm_df is not None:
                self._save_dataframe(llm_df)
                return llm_df, llm_summary, True
        except Exception as e:
            logger.error(f"LLM modification failed: {e}")

        return df, f"Could not apply modification: '{instruction}'. Please specify the column name and new value clearly.", False

    def _try_deterministic_rule(
        self,
        q_lower: str,
        raw_instruction: str,
        df: pd.DataFrame,
        profile: SheetProfile
    ) -> Tuple[bool, Optional[pd.DataFrame], str]:
        """Rule-based handler for standard spreadsheet edit patterns."""
        cols = [c.name for c in profile.columns if c.name != "__row__"]

        # Pattern 1A: Update specific cell/record e.g. "update marks of Harish Akshay H to 95" or "set MARKS = 95 where NAMES = Harish"
        # Match: update/set/change [target_col] ... to/as/= [value] where/for/of [entity]
        update_match_1 = re.search(
            r'\b(?:update|set|change|modify)\s+([a-zA-Z0-9_\s]+?)\s+(?:of|for|where|=)\s+(.+?)\s+(?:to|=|as)\s+([0-9\.]+|[a-zA-Z0-9_\s]+)',
            q_lower
        )
        # Match alternative order: "set marks to 95 for Harish" or "update MARKS to 95 where NAMES = Harish"
        update_match_2 = re.search(
            r'\b(?:update|set|change|modify)\s+([a-zA-Z0-9_\s]+?)\s+(?:to|=|as)\s+([0-9\.]+|[a-zA-Z0-9_\s]+?)\s+(?:where|for|of)\s+(.+)',
            q_lower
        )
        # Match: "update Harish marks to 95"
        update_match_3 = re.search(
            r'\b(?:update|set|change|modify)\s+(.+?)\s+([a-zA-Z0-9_\s]+?)\s+(?:to|=|as)\s+([0-9\.]+|[a-zA-Z0-9_\s]+)',
            q_lower
        )

        matched_update = None
        if update_match_1:
            matched_update = (update_match_1.group(1).strip(), update_match_1.group(2).strip(), update_match_1.group(3).strip())
        elif update_match_2:
            matched_update = (update_match_2.group(1).strip(), update_match_2.group(3).strip(), update_match_2.group(2).strip())
        elif update_match_3:
            matched_update = (update_match_3.group(2).strip(), update_match_3.group(1).strip(), update_match_3.group(3).strip())

        if matched_update:
            target_col_candidate, entity_val, new_val_str = matched_update
            # Strip prefixes like "student" or "names =" from entity_val
            entity_val = re.sub(r'^(?:names?\s*=|student\s+|customer\s+|employee\s+|id\s*=)', '', entity_val).strip().strip("'\"")
            target_col = self._find_matching_col(target_col_candidate, cols)
            if target_col:
                for c in cols:
                    mask = df[c].astype(str).str.lower().str.contains(re.escape(entity_val), na=False, regex=True)
                    if mask.any():
                        new_val = self._parse_val_type(new_val_str, df[target_col].dtype)
                        df.loc[mask, target_col] = new_val
                        matched_rows = mask.sum()
                        return True, df, f"Successfully updated **{target_col}** to **{new_val}** for '{entity_val}' ({matched_rows} row(s) updated)."

        # Pattern 2: Mathematical bonus or scaling e.g. "give 5 bonus marks to all students" or "increase all marks by 5"
        bonus_match = re.search(
            r'\b(?:give|add|increase)\s+(?:all\s+)?(\d+(?:\.\d+)?)\s*(?:bonus\s+points?|bonus\s+marks?|marks?|points?|units?)?\s*(?:to|in|for)\s+(?:all\s+)?([a-zA-Z0-9_\s]+)',
            q_lower
        )
        if bonus_match:
            inc_val = float(bonus_match.group(1))
            col_cand = bonus_match.group(2).strip()
            # If col_cand is "students" or "records", find the primary score/marks column
            if col_cand in ["students", "records", "rows", "employees"]:
                col_cand = "marks" if "marks" in [c.lower() for c in cols] else (cols[1] if len(cols) > 1 else cols[0])
            target_col = self._find_matching_col(col_cand, cols)
            if target_col and pd.api.types.is_numeric_dtype(df[target_col]):
                df[target_col] = df[target_col] + inc_val
                return True, df, f"Added **{inc_val}** bonus points to **{target_col}** across all {len(df)} records."

        scale_match = re.search(
            r'\b(?:increase|add|multiply|divide|decrease|subtract)\s+(?:all\s+)?([a-zA-Z0-9_\s]+?)\s+by\s+(\d+(?:\.\d+)?)',
            q_lower
        )
        if scale_match:
            col_cand = scale_match.group(1).strip()
            num_val = float(scale_match.group(2))
            target_col = self._find_matching_col(col_cand, cols)
            if target_col and pd.api.types.is_numeric_dtype(df[target_col]):
                if "increase" in q_lower or "add" in q_lower:
                    df[target_col] = df[target_col] + num_val
                    return True, df, f"Increased **{target_col}** by **{num_val}** for all records."
                elif "decrease" in q_lower or "subtract" in q_lower:
                    df[target_col] = df[target_col] - num_val
                    return True, df, f"Decreased **{target_col}** by **{num_val}** for all records."
                elif "multiply" in q_lower:
                    df[target_col] = df[target_col] * num_val
                    return True, df, f"Multiplied **{target_col}** by **{num_val}** for all records."
                elif "divide" in q_lower and num_val != 0:
                    df[target_col] = df[target_col] / num_val
                    return True, df, f"Divided **{target_col}** by **{num_val}** for all records."

        # Pattern 3: Add new column with conditional calculation e.g. "add new column Status with Pass if Marks >= 50 else Fail"
        cond_col_match = re.search(
            r'\b(?:add|create|insert)\s+(?:a\s+)?(?:new\s+)?column\s+([a-zA-Z0-9_\s]+?)\s+(?:with|as|=)\s+(.+?)\s+if\s+([a-zA-Z0-9_\s]+?)\s*(>=|<=|>|<|==|=|is)\s*([0-9\.]+|[a-zA-Z0-9_]+)\s+else\s+(.+)',
            raw_instruction,
            re.IGNORECASE
        )
        if cond_col_match:
            new_col_name = cond_col_match.group(1).strip()
            true_val = cond_col_match.group(2).strip().strip("'\"")
            cond_col_name = cond_col_match.group(3).strip()
            op = cond_col_match.group(4).strip()
            thresh_str = cond_col_match.group(5).strip()
            false_val = cond_col_match.group(6).strip().strip("'\"")

            target_cond_col = self._find_matching_col(cond_col_name, cols)
            if target_cond_col:
                col_series = pd.to_numeric(df[target_cond_col], errors="coerce")
                thresh = float(thresh_str)
                if op in [">=", "is >="]:
                    mask = col_series >= thresh
                elif op in [">", "is >"]:
                    mask = col_series > thresh
                elif op in ["<=", "is <="]:
                    mask = col_series <= thresh
                elif op in ["<", "is <"]:
                    mask = col_series < thresh
                else:
                    mask = col_series == thresh

                df[new_col_name] = np.where(mask, true_val, false_val)
                return True, df, f"Created new column **{new_col_name}** with condition '{target_cond_col} {op} {thresh}' -> **'{true_val}'** else **'{false_val}'**."

        # Pattern 4: Add new column with constant value or formula e.g. "add column Notes with 'Reviewed'"
        add_col_match = re.search(
            r'\b(?:add|create|insert)\s+(?:a\s+)?(?:new\s+)?column\s+([a-zA-Z0-9_\s]+?)\s+(?:with|as|=)\s+(.+)',
            raw_instruction,
            re.IGNORECASE
        )
        if add_col_match:
            new_col_name = add_col_match.group(1).strip()
            val_str = add_col_match.group(2).strip().strip("'\"")
            df[new_col_name] = val_str
            return True, df, f"Added new column **{new_col_name}** initialized to **'{val_str}'**."

        # Pattern 5: Delete rows matching condition e.g. "delete rows where marks < 40" or "remove rows where Region is South"
        del_rows_match = re.search(
            r'\b(?:delete|remove|drop)\s+rows?\s+where\s+([a-zA-Z0-9_\s]+?)\s*(>=|<=|>|<|==|=|is|equals)\s*(.+)',
            q_lower
        )
        if del_rows_match:
            col_cand = del_rows_match.group(1).strip()
            op = del_rows_match.group(2).strip()
            val_str = del_rows_match.group(3).strip().strip("'\"")
            target_col = self._find_matching_col(col_cand, cols)
            if target_col:
                orig_len = len(df)
                if pd.api.types.is_numeric_dtype(df[target_col]):
                    num_val = float(val_str)
                    col_num = pd.to_numeric(df[target_col], errors="coerce")
                    if op in ["<", "is <"]:
                        df = df[~(col_num < num_val)]
                    elif op in ["<=", "is <="]:
                        df = df[~(col_num <= num_val)]
                    elif op in [">", "is >"]:
                        df = df[~(col_num > num_val)]
                    elif op in [">=", "is >="]:
                        df = df[~(col_num >= num_val)]
                    else:
                        df = df[~(col_num == num_val)]
                else:
                    df = df[~df[target_col].astype(str).str.lower().str.contains(re.escape(val_str.lower()), na=False)]
                deleted_cnt = orig_len - len(df)
                return True, df, f"Removed **{deleted_cnt}** row(s) where **{target_col}** was {op} '{val_str}' (remaining: {len(df)} rows)."

        # Pattern 6: Rename column e.g. "rename column NAMES to Student Name"
        rename_match = re.search(
            r'\brename\s+(?:column\s+)?([a-zA-Z0-9_\s]+?)\s+to\s+([a-zA-Z0-9_\s]+)',
            q_lower
        )
        if rename_match:
            old_candidate = rename_match.group(1).strip()
            new_name = rename_match.group(2).strip()
            old_col = self._find_matching_col(old_candidate, cols)
            if old_col and new_name:
                df = df.rename(columns={old_col: new_name})
                return True, df, f"Renamed column **{old_col}** to **{new_name}**."

        # Pattern 7: Delete column e.g. "delete column Discount" or "drop column Profit"
        drop_col_match = re.search(
            r'\b(?:delete|remove|drop)\s+column\s+([a-zA-Z0-9_\s]+)',
            q_lower
        )
        if drop_col_match:
            target_candidate = drop_col_match.group(1).strip()
            col_to_drop = self._find_matching_col(target_candidate, cols)
            if col_to_drop and col_to_drop in df.columns:
                df = df.drop(columns=[col_to_drop])
                return True, df, f"Removed column **{col_to_drop}** from the spreadsheet."

        # Pattern 8: Fill missing values e.g. "fill missing values in MARKS with 0"
        fill_match = re.search(
            r'\bfill\s+(?:missing|null|blank|na)(?:\s+values)?(?:\s+in\s+([a-zA-Z0-9_\s]+?))?\s+with\s+([0-9\.]+|[a-zA-Z0-9_\s]+)',
            q_lower
        )
        if fill_match:
            col_cand = fill_match.group(1).strip() if fill_match.group(1) else None
            fill_val_str = fill_match.group(2).strip()
            if col_cand:
                col_to_fill = self._find_matching_col(col_cand, cols)
                if col_to_fill:
                    parsed_fill = self._parse_val_type(fill_val_str, df[col_to_fill].dtype)
                    cnt = df[col_to_fill].isna().sum()
                    df[col_to_fill] = df[col_to_fill].fillna(parsed_fill)
                    return True, df, f"Filled {cnt} missing values in **{col_to_fill}** with **{parsed_fill}**."
            else:
                for c in cols:
                    df[c] = df[c].fillna(self._parse_val_type(fill_val_str, df[c].dtype))
                return True, df, f"Filled all missing values with **{fill_val_str}** across the sheet."

        return False, None, ""

    def _apply_llm_transformation(
        self,
        instruction: str,
        df: pd.DataFrame,
        profile: SheetProfile
    ) -> Tuple[Optional[pd.DataFrame], str]:
        """Use Gemini to generate a safe Python/pandas transformation code block."""
        llm = get_llm_service()
        columns_info = [{"name": c.name, "dtype": c.dtype} for c in profile.columns if c.name != "__row__"]
        
        system_prompt = (
            "You are a pandas code generator for spreadsheet data modification. "
            "Given a user instruction and DataFrame column schema, generate ONLY the Python code to mutate `df`. "
            "Assume `df` is already loaded as a pandas DataFrame. "
            "Output ONLY the python code inside ```python ``` fences. "
            "Do not import external system modules. Safe pandas/numpy code only. "
            "Also include a final comment `# SUMMARY: <one sentence summary of change>`."
        )

        user_prompt = (
            f"Columns: {columns_info}\n"
            f"Active Sheet: {self.sheet_name}\n"
            f"Instruction: {instruction}\n\n"
            "Generate the code to modify `df`:"
        )

        try:
            # Get code from LLM
            raw_response = ""
            if hasattr(llm, "plan"):
                # Use Gemini or LLM service
                from app.services.llm_service import GeminiLLM
                gemini = GeminiLLM()
                raw_response = gemini.rephrase(system_prompt, user_prompt)

            # Extract python code
            code_match = re.search(r'```(?:python)?(.*?)```', raw_response, re.DOTALL)
            code = code_match.group(1).strip() if code_match else raw_response.strip()

            # Extract summary comment
            summary_match = re.search(r'#\s*SUMMARY:\s*(.+)', code)
            summary = summary_match.group(1).strip() if summary_match else f"Updated data according to: '{instruction}'."

            # Clean code of disallowed keywords
            disallowed = ["import os", "import sys", "import subprocess", "eval(", "exec(", "__import__", "open("]
            if any(bad in code for bad in disallowed):
                raise ValueError("Disallowed operation detected in generated code.")

            # Execute safely
            local_scope = {"df": df.copy(), "pd": pd, "np": np}
            exec(code, {}, local_scope)

            res_df = local_scope.get("df")
            if isinstance(res_df, pd.DataFrame):
                return res_df, summary
        except Exception as e:
            logger.error(f"Error executing LLM transformation: {e}")

        return None, ""

    def _find_matching_col(self, candidate: str, cols: List[str]) -> Optional[str]:
        cand_clean = candidate.lower().strip()
        for c in cols:
            if c.lower() == cand_clean or cand_clean in c.lower() or c.lower() in cand_clean:
                return c
        return None

    def _parse_val_type(self, val_str: str, target_dtype: Any) -> Any:
        try:
            if "int" in str(target_dtype):
                return int(float(val_str))
            if "float" in str(target_dtype):
                return float(val_str)
        except ValueError:
            pass
        return val_str

    def _save_dataframe(self, updated_df: pd.DataFrame):
        """Persist the modified DataFrame back to the spreadsheet file on disk."""
        # Remove internal columns before saving
        save_df = updated_df.copy()
        if "__row__" in save_df.columns:
            save_df = save_df.drop(columns=["__row__"])

        if self.file_type in ["xlsx", "xls"]:
            # If multi-sheet Excel file, preserve other sheets
            try:
                with pd.ExcelFile(self.file_path) as xls:
                    sheet_names = xls.sheet_names
                    all_sheets = {s: pd.read_excel(xls, sheet_name=s) for s in sheet_names}
                all_sheets[self.sheet_name] = save_df
                with pd.ExcelWriter(self.file_path, engine="openpyxl") as writer:
                    for s_name, s_df in all_sheets.items():
                        s_df.to_excel(writer, sheet_name=s_name, index=False)
            except Exception:
                save_df.to_excel(self.file_path, sheet_name=self.sheet_name, index=False)
        else:
            save_df.to_csv(self.file_path, index=False)
