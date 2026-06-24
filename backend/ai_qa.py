import os
import base64
import httpx

from zai import ZhipuAiClient


PAGE_LABELS = {
    "course_table": "课表", "credits": "学分绩点", "scores": "成绩",
    "exams": "考试安排", "home": "个人主页",
}


def get_page_label(filename):
    base = os.path.basename(filename).replace(".txt","").replace(".pdf","")
    for key, label in PAGE_LABELS.items():
        if key in base: return label
    return base


def format_course_json_to_text(data_dir):
    """Convert course_data.json to readable text if course_table.txt is empty"""
    json_path = os.path.join(data_dir, "course_data.json")
    if not os.path.exists(json_path):
        return None
    try:
        import json, re
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        table0 = data.get("table0", data)
        marshal = table0.get("marshalContents", [])
        if not marshal or not any(marshal):
            return None
        days = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
        unit_count = data.get("unitCount", table0.get("unitCount", 12))
        lines = ["===== 课程表 =====", ""]
        for day_idx in range(7):
            day_name = days[day_idx] if day_idx < len(days) else f"星期{day_idx+1}"
            day_lines = []
            for period in range(unit_count):
                idx = day_idx * unit_count + period
                if idx < len(marshal) and marshal[idx]:
                    content = marshal[idx].replace("<br>", " | ").replace("<br/>", " | ").replace("<br />", " | ")
                    day_lines.append(f"  第{period+1}节: {content}")
            if day_lines:
                lines.append(f"【{day_name}】")
                lines.extend(day_lines)
                lines.append("")
        return "\n".join(lines) if len(lines) > 2 else None
    except:
        return None


def filter_relevant_files(question, data_dir):
    """Only load files relevant to the question"""
    all_files = sorted([f for f in os.listdir(data_dir) if f.endswith(".txt")])
    if not all_files: return []
    
    keywords = {
        "课表": ["course_table"], "课程": ["course_table"], "上课": ["course_table"],
        "教室": ["course_table"], "教师": ["course_table"], "老师": ["course_table"],
        "成绩": ["scores", "credits"], "分数": ["scores"], "考了多少": ["scores"],
        "绩点": ["credits"], "学分": ["credits"], "gpa": ["credits"],
        "考试": ["exams"], "考场": ["exams"], "什么时候考": ["exams"],
        "个人信息": ["home"], "学号": ["home"], "专业": ["home"],
    }
    matched = set()
    for kw, prefixes in keywords.items():
        if kw in question:
            for f in all_files:
                for pf in prefixes:
                    if pf in f: matched.add(f)
    return [f for f in all_files if f in matched] or all_files


class GLMAgent:
    def __init__(self, api_key=None):
        self.api_key = api_key or os.getenv("API_KEY", "")
        self.model = "glm-4-flash"  # faster than glm-4.6v for text

    def analyze_texts(self, question, data_dir):
        if not self.api_key:
            return "API_KEY not configured"
        
        relevant = filter_relevant_files(question, data_dir)
        if not relevant:
            return None
        
        chunks = []
        total_len = 0
        max_total = 2000
        max_per_file = 800
        
        for fn in relevant:
            fp = os.path.join(data_dir, fn)
            label = get_page_label(fn)
            with open(fp, "r", encoding="utf-8") as f:
                text = f.read()
            if "course_table" in fn and not any(kw in text for kw in ["教师", "教室", "周次", "课程"]):
                json_text = format_course_json_to_text(data_dir)
                if json_text:
                    text = json_text
            if len(text) > max_per_file:
                text = text[:max_per_file] + "..."
            chunk = "=== " + label + " ===\n" + text
            if total_len + len(chunk) > max_total:
                chunk = chunk[:max_total - total_len] + "..."
            chunks.append(chunk)
            total_len += len(chunk)
            if total_len >= max_total:
                break
        
        full = "\n\n".join(chunks)
        table_instruction = ""
        if any(kw in question for kw in ["课表", "课程表", "上课"]):
            table_instruction = "课表请按天分段清晰列出，同一课程在同一天内如有连续节次则合并（如3-4节）。不要额外解释。"
        prompt = f"根据以下数据用中文回答。直接提取关键信息，不要编造。\n\n{full}\n\n{table_instruction}\n问题：{question}"
        
        try:
            http_client = httpx.Client(timeout=60)
            client = ZhipuAiClient(api_key=self.api_key, http_client=http_client)
            r = client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=512,
                temperature=0.01,
                stream=False,
            )
            if r.choices and r.choices[0].message and r.choices[0].message.content:
                return r.choices[0].message.content
            return "Unable to generate answer"
        except Exception as e:
            return f"Request failed: {str(e)}"

    def analyze_pdfs(self, question, pdf_paths):
        if not pdf_paths:
            return "No PDF data available"
        if not self.api_key:
            return "API_KEY not configured"
        
        file_contents = []
        for i, pdf_path in enumerate(pdf_paths[:3]):  # max 3 PDFs
            try:
                label = get_page_label(os.path.basename(pdf_path))
                with open(pdf_path, "rb") as f:
                    pdf_data = f.read()
                pdf_b64 = base64.b64encode(pdf_data).decode("utf-8")
                file_contents.append({"type": "text", "text": f"Doc {i+1}: {label}"})
                file_contents.append({"type": "file_url", "file_url": {"url": f"data:application/pdf;base64,{pdf_b64}"}})
            except Exception as e:
                print(f"Read PDF {pdf_path} failed: {e}")
        file_contents.append({"type": "text", "text": f"Extract key data directly from these documents.\n\n{question}"})
        try:
            http_client = httpx.Client(timeout=120)
            client = ZhipuAiClient(api_key=self.api_key, http_client=http_client)
            r = client.chat.completions.create(
                model="glm-4v-flash",
                messages=[{"role": "user", "content": file_contents}],
                max_tokens=1024,
                stream=False,
            )
            if r.choices and r.choices[0].message and r.choices[0].message.content:
                return r.choices[0].message.content
            return "Unable to generate answer"
        except Exception as e:
            return f"Request failed: {str(e)}"

    def analyze_images(self, question, paths):
        return self.analyze_pdfs(question, paths)