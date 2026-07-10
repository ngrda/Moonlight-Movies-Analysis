from flask import Flask, jsonify, send_from_directory, request, Response
from flask_cors import CORS
import pandas as pd
import os
import re
import io
import json
from datetime import datetime

app = Flask(__name__, static_folder=".")
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
EXPORT_DIR = os.path.join(BASE_DIR, "exports")
GLOBAL_CSV = os.path.join(DATA_DIR, "mlm_global.csv")
INDI_CSV = os.path.join(DATA_DIR, "mlm_indi.csv")

os.makedirs(EXPORT_DIR, exist_ok=True)


def clean_columns(df):
    df.columns = [re.sub(r"[\s\u00a0\u00ca\u00c2]+", " ", col).strip() for col in df.columns]
    return df


def load_csv(path):
    df = pd.read_csv(path, sep=";", encoding="latin-1")
    df = clean_columns(df)
    return df.fillna(0)


def format_day(day_value):
    return str(day_value).split(" ")[0].strip()


def day_to_id(day_value):
    return format_day(day_value).replace("/", "-")


def parse_day(day_str):
    try:
        return datetime.strptime(format_day(day_str), "%d/%m/%y")
    except ValueError:
        return None


def week_label(day_str, index):
    dt = parse_day(day_str)
    if dt:
        return f"Week {index + 1} · {dt.strftime('%b %d, %Y')}"
    return f"Week {index + 1} · {format_day(day_str)}"


def growth_pct(current, previous):
    if previous == 0:
        return 0.0 if current == 0 else 100.0
    return round(((current - previous) / previous) * 100, 1)


def load_merged():
    global_df = load_csv(GLOBAL_CSV)
    indi_df = load_csv(INDI_CSV)

    global_df["_id"] = global_df["Day"].apply(day_to_id)
    indi_df["_id"] = indi_df["Day"].apply(day_to_id)

    return global_df, indi_df


def build_top_products(global_row, indi_row):
    products = []
    product_cols = [c for c in indi_row.index if c not in ("Day", "_id")]

    for name in product_cols:
        units = int(indi_row[name])
        if units <= 0:
            continue
        is_polly = name.startswith("Polly")
        brand = "Polly's Pop" if is_polly else "Pioneer"
        clean_name = re.sub(r"^(Polly|Pioneer)\s+", "", name).strip()
        avg_price = 3.50 if is_polly else 2.75
        products.append({
            "name": f"{brand} {clean_name}",
            "units": units,
            "price": round(avg_price, 2),
            "revenue": round(units * avg_price, 2),
            "category": "soda",
        })

    # Only beverages (soda) are shown in the Top Selling Products list.
    # Popcorn/Snowcones still count toward revenue mix and delivery totals elsewhere.
    return sorted(products, key=lambda p: p["units"], reverse=True)


def build_week_payload(global_row, indi_row, index, prev_global_row=None):
    revenue = float(global_row["Net Sales"])
    prev_revenue = float(prev_global_row["Net Sales"]) if prev_global_row is not None else 0

    # CAMBIO: Extraer las unidades físicas de las columnas de conteo en mlm_global
    # Asegúrate de que los nombres coincidan exactamente con tus columnas (ej. "Popcorn", "Snowcones")
    popcorn_units = int(global_row["Popcorn"])
    snowcone_units = int(global_row["Snowcones"])
    
    # Para los refrescos (Polly y Pioneer), sumamos las unidades vendidas desde indi_row
    polly_units = sum(int(v) for k, v in indi_row.items() if k.startswith("Polly"))
    pioneer_units = sum(int(v) for k, v in indi_row.items() if k.startswith("Pioneer"))
    
    # Si "Others" no tiene desglose físico, puedes dejarlo en 0 o estimarlo. Aquí lo tratamos como unidades:
    others_units = int(global_row.get("Others", 0)) 

    # Cambiamos el mix para que guarde unidades en lugar de dinero
    mix = {
        "popcorn": popcorn_units,
        "snowcones": snowcone_units,
        "polly": polly_units,
        "pioneer": pioneer_units,
        "others": others_units,
    }
    mix_total = sum(mix.values())
    mix_pct = {k: round((v / mix_total) * 100, 1) if mix_total else 0 for k, v in mix.items()}

    # Revenue (beneficio) breakdown: allocate the week's actual Net Sales across
    # categories using the same proportions as the unit mix, so the dollar figures
    # always add up to the real net revenue for the week.
    mix_revenue = {k: round((pct / 100) * revenue, 2) for k, pct in mix_pct.items()}

    top_products = build_top_products(global_row, indi_row)
    product_units = sum(p["units"] for p in top_products if p["category"] == "soda")

    day = format_day(global_row["Day"])
    category = str(global_row.get("Category", "")).strip()
    temperature = str(global_row.get("Temperature", "")).strip()
    attendance = int(global_row["Attendance"])
    avg_spend = round(revenue / attendance, 2) if attendance else 0.0

    return {
        "id": global_row["_id"],
        "label": week_label(global_row["Day"], index),
        "date": day,
        "category": category,
        "temperature": temperature,
        "metrics": {
            "total_revenue": round(revenue, 2),
            "revenue_growth": growth_pct(revenue, prev_revenue),
            "previous_week_revenue": round(prev_revenue, 2),
            "total_orders": int(global_row["Total Sales"]),
            "product_units": product_units,
            "total_customers": attendance,
            "total_deliveries": int(global_row["Popcorn"]) + int(global_row["Snowcones"]),
            "total_popcorn": int(global_row["Popcorn"]),
            "total_snowcones": int(global_row["Snowcones"]),
            "avg_spend_per_attendee": avg_spend,
        },
        "breakdown": mix,
        "breakdown_pct": mix_pct,
        "breakdown_revenue": mix_revenue,
        "top_products": top_products[:5],
        "charts": {
            "labels": ["Popcorn", "Snowcones", "Polly's Pop", "Pioneer", "Others"],
            "values": [mix["popcorn"], mix["snowcones"], mix["polly"], mix["pioneer"], mix["others"]],
            "revenue_values": [mix_revenue["popcorn"], mix_revenue["snowcones"], mix_revenue["polly"], mix_revenue["pioneer"], mix_revenue["others"]],
        },
        "raw": {
            "global": {k: (float(v) if isinstance(v, (int, float)) else str(v)) for k, v in global_row.items() if k != "_id"},
            "products": {k: int(v) for k, v in indi_row.items() if k not in ("Day", "_id")},
        },
    }


def get_all_weeks():
    global_df, indi_df = load_merged()
    weeks = []

    for i, (_, grow) in enumerate(global_df.iterrows()):
        prev = global_df.iloc[i - 1] if i > 0 else None
        indi_row = indi_df[indi_df["_id"] == grow["_id"]]
        if indi_row.empty:
            continue
        weeks.append(build_week_payload(grow, indi_row.iloc[0], i, prev))

    return weeks


def find_week(week_id):
    weeks = get_all_weeks()
    for w in weeks:
        if w["id"] == week_id:
            return w
    return None


def write_export_files(week):
    week_id = week["id"]
    json_path = os.path.join(EXPORT_DIR, f"week_{week_id}.json")
    csv_path = os.path.join(EXPORT_DIR, f"week_{week_id}.csv")

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(week, f, indent=2, ensure_ascii=False)

    rows = []
    rows.append(["Section", "Field", "Value"])
    rows.append(["Summary", "Week", week["label"]])
    rows.append(["Summary", "Date", week["date"]])
    rows.append(["Summary", "Category", week["category"]])
    rows.append(["Summary", "Net Revenue", week["metrics"]["total_revenue"]])
    rows.append(["Summary", "Attendance", week["metrics"]["total_customers"]])
    rows.append(["Summary", "Total Orders", week["metrics"]["total_orders"]])
    rows.append([])

    for key, val in week["breakdown"].items():
        rows.append(["Revenue Breakdown", key.title(), val])

    rows.append([])
    rows.append(["Product", "Units", "Unit Price", "Revenue"])
    for p in week["top_products"]:
        rows.append([p["name"], p["units"], p["price"], p["revenue"]])

    csv_content = "\n".join(";".join(str(c) for c in row) for row in rows if row)
    with open(csv_path, "w", encoding="utf-8") as f:
        f.write(csv_content)

    return json_path, csv_path


@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/styles.css")
def serve_css():
    return send_from_directory(BASE_DIR, "styles.css")


@app.route("/app.js")
def serve_js():
    return send_from_directory(BASE_DIR, "app.js")


@app.route("/api/overview", methods=["GET"])
def get_overview():
    if not os.path.exists(GLOBAL_CSV) or not os.path.exists(INDI_CSV):
        return jsonify({"error": "CSV files not found"}), 404

    weeks = get_all_weeks()
    if not weeks:
        return jsonify({"error": "No data"}), 404

    total_revenue = round(sum(w["metrics"]["total_revenue"] for w in weeks), 2)
    total_orders = sum(w["metrics"]["total_orders"] for w in weeks)
    total_customers = sum(w["metrics"]["total_customers"] for w in weeks)
    total_deliveries = sum(w["metrics"]["total_deliveries"] for w in weeks)
    total_popcorn = sum(w["metrics"]["total_popcorn"] for w in weeks)
    total_snowcones = sum(w["metrics"]["total_snowcones"] for w in weeks)
    total_units = sum(w["metrics"]["product_units"] for w in weeks)

    mix_keys = ["popcorn", "snowcones", "polly", "pioneer", "others"]
    mix_totals = {k: round(sum(w["breakdown"][k] for w in weeks), 2) for k in mix_keys}
    mix_total_sum = sum(mix_totals.values())
    mix_pct = {k: round((v / mix_total_sum) * 100, 1) if mix_total_sum else 0 for k, v in mix_totals.items()}

    trend = [{
        "id": w["id"],
        "label": w["label"].split(" · ")[0],
        "date": w["date"],
        "revenue": w["metrics"]["total_revenue"],
        "orders": w["metrics"]["total_orders"],
        "customers": w["metrics"]["total_customers"],
    } for w in weeks]

    best_week = max(weeks, key=lambda w: w["metrics"]["total_revenue"])
    worst_week = min(weeks, key=lambda w: w["metrics"]["total_revenue"])

    product_totals = {}
    for w in weeks:
        for p in w["top_products"]:
            entry = product_totals.setdefault(p["name"], {
                "name": p["name"],
                "units": 0,
                "revenue": 0.0,
                "category": p["category"],
            })
            entry["units"] += p["units"]
            entry["revenue"] += p["revenue"]

    top_products = sorted(product_totals.values(), key=lambda p: p["revenue"], reverse=True)
    for p in top_products:
        p["revenue"] = round(p["revenue"], 2)
        p["price"] = round(p["revenue"] / p["units"], 2) if p["units"] else 0

    avg_revenue = round(total_revenue / len(weeks), 2) if weeks else 0
    avg_spend_per_attendee = round(total_revenue / total_customers, 2) if total_customers else 0.0

    return jsonify({
        "weeks_count": len(weeks),
        "metrics": {
            "total_revenue": total_revenue,
            "avg_revenue_per_week": avg_revenue,
            "total_orders": total_orders,
            "total_customers": total_customers,
            "total_deliveries": total_deliveries,
            "total_popcorn": total_popcorn,
            "total_snowcones": total_snowcones,
            "total_units": total_units,
            "avg_spend_per_attendee": avg_spend_per_attendee,
        },
        "breakdown": mix_totals,
        "breakdown_pct": mix_pct,
        "trend": trend,
        "best_week": {"label": best_week["label"], "revenue": best_week["metrics"]["total_revenue"]},
        "worst_week": {"label": worst_week["label"], "revenue": worst_week["metrics"]["total_revenue"]},
        "top_products": top_products[:5],
    })


@app.route("/api/weeks", methods=["GET"])
def list_weeks():
    if not os.path.exists(GLOBAL_CSV) or not os.path.exists(INDI_CSV):
        return jsonify({"error": "CSV files not found"}), 404

    weeks = get_all_weeks()
    summary = [{
        "id": w["id"],
        "label": w["label"],
        "date": w["date"],
        "category": w["category"],
        "revenue": w["metrics"]["total_revenue"],
        "orders": w["metrics"]["total_orders"],
        "customers": w["metrics"]["total_customers"],
    } for w in weeks]

    return jsonify({"weeks": summary, "count": len(summary)})


@app.route("/api/weeks/<week_id>", methods=["GET"])
def get_week(week_id):
    week = find_week(week_id)
    if not week:
        return jsonify({"error": "Week not found"}), 404

    write_export_files(week)
    return jsonify(week)


@app.route("/api/data", methods=["GET"])
def get_data_legacy():
    weeks = get_all_weeks()
    if not weeks:
        return jsonify({"error": "No data"}), 404

    week_id = request.args.get("week")
    if week_id:
        week = find_week(week_id)
        if not week:
            return jsonify({"error": "Week not found"}), 404
        return jsonify(week)

    return jsonify(weeks[-1])


@app.route("/api/export/<week_id>/<fmt>", methods=["GET"])
def export_week(week_id, fmt):
    week = find_week(week_id)
    if not week:
        return jsonify({"error": "Week not found"}), 404

    json_path, csv_path = write_export_files(week)
    filename_base = f"sales_report_{week['date'].replace('/', '-')}"

    if fmt == "json":
        with open(json_path, "r", encoding="utf-8") as f:
            content = f.read()
        return Response(
            content,
            mimetype="application/json",
            headers={"Content-Disposition": f"attachment; filename={filename_base}.json"},
        )

    if fmt == "csv":
        with open(csv_path, "r", encoding="utf-8") as f:
            content = f.read()
        return Response(
            content,
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename_base}.csv"},
        )

    return jsonify({"error": "Format not supported. Use json or csv."}), 400


@app.route("/api/export/all/csv", methods=["GET"])
def export_all_csv():
    weeks = get_all_weeks()
    if not weeks:
        return jsonify({"error": "No data"}), 404

    global_df, _ = load_merged()
    buffer = io.StringIO()
    global_df.drop(columns=["_id"]).to_csv(buffer, sep=";", index=False)
    content = buffer.getvalue()

    return Response(
        content,
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=sales_all_weeks.csv"},
    )


if __name__ == "__main__":
    app.run(debug=True, port=5050)
