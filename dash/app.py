from dash import Dash, html, dcc, dash_table, callback_context, no_update
from dash.dependencies import Input, Output, State
import os
from urllib.parse import parse_qs
import requests
import plotly.graph_objects as go
from dash.exceptions import PreventUpdate
import html as pyhtml

from datetime import datetime, date
import hashlib

PARTY_META = {
    "PAP": {"colour": "#E53935", "name": "People's Action Party"},
    "WP": {"colour": "#1E88E5", "name": "Workers' Party"},
    "PSP": {"colour": "#FB8C00", "name": "Progress Singapore Party"},
    "SDP": {"colour": "#43A047", "name": "Singapore Democratic Party"},
    "NSP": {"colour": "#00897B", "name": "National Solidarity Party"},
    "SPP": {"colour": "#8E24AA", "name": "Singapore People's Party"},
    "PPP": {"colour": "#D81B60", "name": "People's Power Party"},
    "RDU": {"colour": "#5E35B1", "name": "Red Dot United"},
    "SDA": {"colour": "#3949AB", "name": "Singapore Democratic Alliance"},
    "PAR": {"colour": "#6D4C41", "name": "People's Alliance for Reform"},
    "SUP": {"colour": "#FDD835", "name": "Singapore United Party"},
    "INDEPENDENT": {"colour": "#546E7A", "name": "Independent"},
}

# Keep for parties not in PARTY_META
DEFAULT_PARTY_COLORS = [
    "#F4D03F",
    "#1ABC9C",
    "#9B59B6",
    "#E67E22",
    "#2ECC71",
    "#E056FD",
    "#00CEC9",
    "#D35400",
    "#6C5CE7",
    "#F368E0",
    "#10AC84",
    "#C8D6E5",
    "#FF6B6B",
    "#48DBFB",
    "#FECA57",
    "#5F27CD",
]

def normalise_party_key(value):
    s = str(value or "").strip().upper()
    if s in ["IND", "INDEP", "INDEPENDENT"]:
        return "INDEPENDENT"
    return s

def stable_fallback_color(party_key):
    if not party_key:
        return "#95A5A6"
    digest = hashlib.md5(party_key.encode("utf-8")).hexdigest()
    idx = int(digest[:8], 16) % len(DEFAULT_PARTY_COLORS)
    return DEFAULT_PARTY_COLORS[idx]

def get_party_color(party, used_colors=None):
    party_key = normalise_party_key(party)

    meta = PARTY_META.get(party_key)
    if meta and meta.get("colour"):
        return str(meta["colour"])

    # deterministic fallback per party
    return stable_fallback_color(party_key)


def hex_to_rgba(hex_colour, alpha):
    s = str(hex_colour or "").strip().lstrip("#")
    if len(s) == 3:
        s = f"{s[0]}{s[0]}{s[1]}{s[1]}{s[2]}{s[2]}"
    if len(s) != 6:
        return f"rgba(149,165,166,{alpha})"
    r = int(s[0:2], 16)
    g = int(s[2:4], 16)
    b = int(s[4:6], 16)
    return f"rgba({r},{g},{b},{alpha})"

def parse_mysql_date(value):
    if value is None:
        return None

    s = str(value).strip()
    if not s:
        return None

    # Handles: "1955-02-27" or "1955-02-27T16:30:00.000Z"
    # Also safe for "1955-02-27 16:30:00"
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
    except Exception:
        try:
            return datetime.strptime(s[:10], "%Y-%m-%d").date()
        except Exception:
            return None

def format_pretty_date(value):
    d = parse_mysql_date(value)
    if d is None:
        return "—"
    # "27 February 1955" (British spelling)
    return f"{d.day} {d.strftime('%B')} {d.year}"

def party_span(abbr, party_map):
    abbr_raw = str(abbr or "").strip()
    if not abbr_raw:
        return "—"

    party_key = normalise_party_key(abbr_raw)
    colour = get_party_color(party_key)

    full = str(party_map.get(party_key, "") or "").strip()
    if not full:
        meta = PARTY_META.get(party_key)
        if meta:
            full = str(meta.get("name") or "").strip()

    title = pyhtml.escape(full if full else party_key, quote=True)
    text = pyhtml.escape(party_key)

    bg = hex_to_rgba(colour, 0.18)
    border = hex_to_rgba(colour, 0.45)

    style = (
        f"background:{bg};"
        f"border:1px solid {border};"
        f"color:rgba(255,255,255,0.92);"
    )
    style_attr = pyhtml.escape(style, quote=True)

    return f"<span class='party-pill' style='{style_attr}' title='{title}'>{text}</span>"


def party_list_spans(abbr_list, party_map):
    if not abbr_list:
        return "—"
    return "".join([party_span(a, party_map) for a in abbr_list])

def split_csv_parties(value):
    if value is None:
        return []
    s = str(value).strip()
    if not s:
        return []
    return [p.strip() for p in s.split(",") if p.strip()]

def get_contesting_parties_from_row(row):
    # Try common keys; adjust if your backend uses a different name
    for key in ["contesting_parties", "contesting_party", "parties_contested", "contesting_parties_csv"]:
        if key in row:
            return split_csv_parties(row.get(key))
    return []

def normalise_na(value):
    if value is None:
        return "—"

    s = str(value).strip()
    if s == "":
        return "—"

    if s.lower() in ["na", "n/a", "null", "none", "nan"]:
        return "—"

    return s

ALL_VALUE = "__ALL__"
def normalise_multi(values):
    if values is None:
        return []
    if not isinstance(values, list):
        values = [values]

    # If ALL is selected together with other items, treat as ALL
    if ALL_VALUE in values:
        return [ALL_VALUE]

    return values

def values_for_query(values):
    values = normalise_multi(values)
    if not values or ALL_VALUE in values:
        return []
    return values


PARTY_COLOR_MAP = {
    "PAP": "#E74C3C",  # red
    "WP":  "#2E86DE",  # blue
}


BACKEND_BASE = os.getenv("BACKEND_BASE", "http://localhost:4000")

DEBUG_LOGS = os.getenv("DASH_DEBUG_LOGS", "false").lower() == "true"

def apply_dark_layout(fig, title, height):
    fig.update_layout(
        title=dict(
            text=title,
            x=0.02,
            xanchor="left",
            font=dict(size=16, color="rgba(255,255,255,0.90)", weight=700),
        ),
        height=height,
        margin=dict(l=26, r=26, t=58, b=34),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color="rgba(255,255,255,0.85)"),
        legend=dict(
            bgcolor="rgba(0,0,0,0)",
            font=dict(color="rgba(255,255,255,0.75)", size=11),
        ),
    )
    return fig
def placeholder_fig(title, height):
    fig = go.Figure()
    apply_dark_layout(fig, title, height=height)
    fig.update_layout(
        xaxis=dict(visible=False),
        yaxis=dict(visible=False),
        annotations=[
            dict(
                text="Loading…",
                x=0.5,
                y=0.5,
                xref="paper",
                yref="paper",
                showarrow=False,
                font=dict(size=13, color="rgba(255,255,255,0.65)"),
            )
        ],
    )
    return fig
FIG_LOADING_OVERALL = placeholder_fig("Overall: constituencies won by party", 420)
FIG_LOADING_YEARLY = placeholder_fig("Year-by-year: constituencies won", 420)

def log(*args):
    if DEBUG_LOGS:
        print(*args, flush=True)


def backend_get_json(path, params=None):
    url = f"{BACKEND_BASE}{path}"


    r = requests.get(
        url,
        params=params,
        headers={
            "Accept": "application/json",
            "Cache-Control": "no-store",
            "Pragma": "no-cache",
        },
        timeout=20,
    )


    r.raise_for_status()
    return r.json()


def to_csv(values):
    if not values:
        return ""
    return ",".join([str(v) for v in values])


def safe_pct(value, digits=3):
    if value is None:
        return "—"
    try:
        return f"{float(value):.{digits}f}%"
    except Exception:
        return "—"


def build_vote_bar(parties):
    fig = go.Figure()

    for p in parties:
        party = p.get("party") or ""
        party_key = normalise_party_key(party)
        colour = get_party_color(party_key, None)

        vote_count = p.get("vote_count")
        vote_share = p.get("vote_share")

        full_name = p.get("party_full_name")
        if not full_name:
            meta = PARTY_META.get(party_key)
            if meta:
                full_name = meta.get("name")
        if not full_name:
            full_name = party_key or party or "—"

        if vote_count is None:
            vote_count = 0
        else:
            vote_count = int(vote_count)

        if vote_share is None:
            share_txt = "—"
        else:
            share_txt = f"{float(vote_share) * 100:.2f}%"

        hover = f"{full_name}<br>Votes: {vote_count}<br>Share: {share_txt}"

        fig.add_trace(
            go.Bar(
                name=party_key or party,
                x=[party_key or party],
                y=[vote_count],
                hovertext=[hover],
                hoverinfo="text",
                marker=dict(color=colour),  # NEW
            )
        )

    # keep the rest of your layout/hoverlabel as-is...
    fig.update_layout(
        title="Votes by party",
        margin=dict(l=26, r=26, t=56, b=46),
        height=200,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(size=12, color="rgba(255,255,255,0.85)", weight=700),
        barmode="group",
        showlegend=False,
        xaxis=dict(
            title="Party",
            gridcolor="rgba(255,255,255,0.08)",
            zerolinecolor="rgba(255,255,255,0.10)",
            tickfont=dict(color="rgba(255,255,255,0.82)"),
        ),
        yaxis=dict(
            title="Votes",
            gridcolor="rgba(255,255,255,0.08)",
            zerolinecolor="rgba(255,255,255,0.10)",
            tickfont=dict(color="rgba(255,255,255,0.82)"),
        ),
    )

    fig.update_traces(
        hoverlabel=dict(
            bgcolor="rgba(11,18,32,0.98)",
            bordercolor="rgba(255,255,255,0.14)",
            font=dict(color="rgba(255,255,255,0.92)"),
        )
    )

    return fig


def build_elector_pie(elector):
    if not elector:
        fig = go.Figure()
        fig.update_layout(
            height=320,
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
        )
        return fig

    registered = int(elector.get("no_of_registered_electors") or 0)
    rejected = int(elector.get("no_of_rejected_votes") or 0)
    spoilt = int(elector.get("no_of_spoilt_ballot_papers") or 0)

    labels = [
        "Registered electors",
        "Rejected votes",
        "Spoilt ballot papers",
    ]
    values = [registered, rejected, spoilt]

    fig = go.Figure(
        data=[
            go.Pie(
                labels=labels,
                values=values,
                hole=0.42,

                # Only show percent for large slices
                textinfo="percent",
                textposition="inside",
                insidetextorientation="radial",

                # Hide labels for tiny slices
                pull=[0, 0, 0],
                sort=False,

                hovertemplate="%{label}<br>%{value:,}<br>%{percent}<extra></extra>",
            )
        ]
    )

    fig.update_traces(
        textfont=dict(color="rgba(255,255,255,0.92)", size=13),
        marker=dict(
            line=dict(color="rgba(0,0,0,0)", width=0)
        ),
    )

    fig.update_layout(
        title=dict(
            text="Registered vs Rejected vs Spoilt Votes",
            x=0.5,
            y=0.95,
            xanchor="center",
            yanchor="top",
            font=dict(size=16, color="rgba(255,255,255,0.85)", weight=700),
        ),

        height=200,
        margin=dict(l=28, r=140, t=60, b=28),

        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color="rgba(255,255,255,0.85)"),

        legend=dict(
            x=1.02,
            y=0.5,
            xanchor="left",
            yanchor="middle",
            bgcolor="rgba(0,0,0,0)",
            font=dict(size=12, color="rgba(255,255,255,0.78)"),
        ),
    )

    return fig



def parse_candidates(parties):
    party_to_candidates = []
    max_len = 0

    def split_candidates(value):
        if value is None:
            return []

        s = str(value).strip()
        if not s:
            return []

        # Support both ";" and "|" delimiters
        raw = []
        for chunk in s.split(";"):
            raw.extend(chunk.split("|"))

        return [c.strip() for c in raw if c.strip()]

    for p in parties:
        party = p.get("party") or ""
        full_name = p.get("party_full_name") or ""
        cand_str = p.get("candidates") or ""
        cand_list = split_candidates(cand_str)

        title = party
        if full_name and full_name != party:
            title = f"{party} ({full_name})"

        party_to_candidates.append((title, cand_list))
        if len(cand_list) > max_len:
            max_len = len(cand_list)

    if not party_to_candidates:
        return html.Div("No party/candidate data found.", className="muted")

    header = html.Tr([html.Th(title) for (title, _lst) in party_to_candidates])

    body_rows = []
    for i in range(max_len):
        row_cells = []
        for (_title, lst) in party_to_candidates:
            val = lst[i] if i < len(lst) else ""
            row_cells.append(html.Td(val))
        body_rows.append(html.Tr(row_cells))

    return html.Div(
        html.Table(
            [html.Thead(header), html.Tbody(body_rows)],
            className="cand-table",
        ),
        className="cand-table-wrap",
    )


# ----------------------------
# Dash app (mounted under /dash/)
# ----------------------------
app = Dash(
    __name__,
    requests_pathname_prefix="/dash/",
    routes_pathname_prefix="/dash/",
    suppress_callback_exceptions=True,
)
server = app.server


@server.after_request
def add_headers(resp):
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"

    resp.headers["Content-Security-Policy"] = (
        "frame-ancestors 'self'"
    )
    if "X-Frame-Options" in resp.headers:
        del resp.headers["X-Frame-Options"]
    return resp

def render_search_tab():
    return html.Div(
        [
            html.Div(
                [
                    html.Div(
                        [
                            html.Label("Year", className="label"),
                            dcc.Dropdown(
                                id="dd-years",
                                options=[],
                                value=[],
                                multi=True,
                                placeholder="All years",
                                className="control",
                            ),
                        ],
                        className="field field--year",
                    ),
                    html.Div(
                        [
                            html.Label("Contesting party", className="label"),
                            dcc.Dropdown(
                                id="dd-contesting",
                                options=[],
                                value=[],
                                multi=True,
                                placeholder="All parties",
                                className="control",
                            ),
                        ],
                        className="field field--contesting",
                    ),
                    html.Div(
                        [
                            html.Label("Winner party", className="label"),
                            dcc.Dropdown(
                                id="dd-winners",
                                options=[],
                                value=[],
                                multi=True,
                                placeholder="All parties",
                                className="control",
                            ),
                        ],
                        className="field field--winner",
                    ),
                    html.Div(
                        [
                            html.Label("Constituency type", className="label"),
                            dcc.Dropdown(
                                id="dd-types",
                                options=[
                                    {"label": "All types", "value": ALL_VALUE},
                                    {"label": "GRC", "value": "GRC"},
                                    {"label": "SMC", "value": "SMC"},
                                ],
                                value=[],
                                multi=True,
                                placeholder="All types",
                                className="control",
                            ),
                        ],
                        className="field field--type",
                    ),
                    html.Div(
                        [
                            html.Label("Constituency", className="label"),
                            dcc.Dropdown(
                                id="dd-consts",
                                options=[],
                                value=[],
                                multi=True,
                                searchable=True,
                                placeholder="All Constituencies",
                                className="control",
                            ),
                        ],
                        className="field field--const",
                    ),
                ],
                className="panel filters",
            ),
            # KPI + Reset row
            html.Div(
                [
                    html.Div(
                        [
                            html.Span("Matched entries: ", className="kpi-line-muted"),
                            html.Span(id="kpi-count", className="kpi-line-strong"),
                        ],
                        className="kpi-line",
                    ),
                    html.Button(
                        "Reset",
                        id="btn-reset-filters",
                        n_clicks=0,
                        type="button",
                        className="btn-reset-filters",
                    ),
                ],
                className="kpi-row",
            ),

            html.Div(
                [
                    html.Div(
                        [
                            html.Div(
                                [
                                    dash_table.DataTable(
                                        id="tbl",
                                        columns=[
                                            {"name": "Year", "id": "year"},
                                            {"name": "Constituency", "id": "constituency"},
                                            {"name": "Constituency Type", "id": "constituency_type"},
                                            {"name": "Contested", "id": "contested_parties", "presentation": "markdown"},
                                            {"name": "Winner", "id": "winner_party", "presentation": "markdown"},
                                            {"name": "Margin", "id": "margin_pct"},
                                        ],
                                        markdown_options={"html": True},
                                        data=[],
                                        sort_action="native",
                                        page_size=14,
                                        style_table={"overflowX": "auto"},
                                        style_header={
                                            "fontWeight": 700,
                                            "fontSize": "12px",
                                            "backgroundColor": "rgba(39, 39, 39, 0.92)",
                                            "borderBottom": "1px solid rgba(255,255,255,0.10)",
                                            "color": "rgba(255,255,255,0.85)",
                                        },
                                        style_cell={
                                            "backgroundColor": "rgba(50, 49, 49, 0.78)",
                                            "borderBottom": "1px solid rgba(255,255,255,0.10)",
                                            "borderLeft": "1px solid rgba(255,255,255,0.10)",
                                            "borderRight": "1px solid rgba(255,255,255,0.10)",
                                            "borderTop": "none",
                                            "color": "rgba(255,255,255,0.88)",
                                            "padding": "4px 10px",
                                            "lineHeight": "1.15",
                                            "fontSize": "12px",
                                            "whiteSpace": "normal",
                                            "height": "auto",
                                            "minWidth": "0px",
                                        },
                                        style_cell_conditional=[
                                            {"if": {"column_id": "year"}, "width": "60px", "maxWidth": "60px"},
                                            {"if": {"column_id": "constituency"}, "width": "140px", "maxWidth": "140px"},
                                            {"if": {"column_id": "constituency_type"}, "width": "120px", "maxWidth": "120px"},
                                            {"if": {"column_id": "contested_parties"}, "width": "260px", "maxWidth": "260px"},
                                            {"if": {"column_id": "winner_party"}, "width": "260px", "maxWidth": "260px"},
                                            {"if": {"column_id": "margin_pct"}, "width": "60px", "maxWidth": "60px"},
                                        ],
                                        css=[
                                            {
                                                "selector": "td[data-dash-column='contested_parties'] div.dash-cell-value.cell-markdown",
                                                "rule": "font-family: inherit; font-size: inherit; font-weight: inherit; line-height: inherit; width: 100%; display: block; text-align: right;",
                                            },
                                            {
                                                "selector": "td[data-dash-column='winner_party'] div.dash-cell-value.cell-markdown",
                                                "rule": "font-family: inherit; font-size: inherit; font-weight: inherit; line-height: inherit; width: 100%; display: block; text-align: right;",
                                            },
                                        ],
                                    )
                                ],
                                className="table-shell",
                            )
                        ],
                        id="left-pane",
                        className="split-left",
                        style={"flex": "1 1 100%", "minWidth": "0"},
                    ),
                    html.Div(
                        [
                            html.Button(
                                "×",
                                id="btn-close-details",
                                n_clicks=0,
                                className="detail-close-x",
                                type="button",
                                **{"aria-label": "Close details"},
                            ),
                            html.Div(
                                id="details-panel",
                                className="panel details-panel",
                                style={"display": "none"},
                            ),
                        ],
                        id="right-pane",
                        className="split-right",
                        style={"display": "none", "flex": "1 1 50%", "minWidth": "0"},
                    ),
                ],
                id="split-wrap",
                className="split-wrap",
            ),
        ]
    )


def render_summary_tab():
    return html.Div(
        [
            # Charts row
            html.Div(
                [
                    html.Div(
                        [
                            dcc.Loading(
                                type="circle",
                                color="rgba(33,212,253,0.9)",
                                children=dcc.Graph(
                                    id="g-overall-winners",
                                    config={"displayModeBar": False, "responsive": True},
                                ),
                            )
                        ],
                        className="panel panel--chart",
                    ),
                    html.Div(
                        [
                            # custom legend container (we'll fill it from callback)
                            html.Div(id="legend-yearly", className="legend-shell"),

                            dcc.Loading(
                                type="circle",
                                color="rgba(33,212,253,0.9)",
                                children=dcc.Graph(
                                    id="g-yearly-winners",
                                    config={"displayModeBar": False, "responsive": True},
                                ),
                            ),
                        ],
                        className="panel panel--chart",
                    ),
                ],
                className="summary-grid",
            ),

            # Tables row
            html.Div(
                [
                    html.Div(
                        [
                            html.Div("Election dates", className="table-title"),
                            dash_table.DataTable(
                                id="tbl-election-dates",
                                columns=[
                                    {"name": "Year", "id": "year"},
                                    {"name": "Nomination day", "id": "nomination_day"},
                                    {"name": "Polling day", "id": "polling_day"},
                                ],
                                data=[],
                                sort_action="native",
                                page_size=16,
                                style_table={"overflowX": "auto"},
                                style_header={
                                    "fontWeight": 700,
                                    "fontSize": "12px",
                                    "backgroundColor": "rgba(15, 10, 49, 0.38)",
                                    "borderBottom": "1px solid rgba(255,255,255,0.10)",
                                    "color": "rgba(255,255,255,0.85)",
                                },
                                style_cell={
                                    "backgroundColor": "rgba(50, 49, 49, 0.40)",
                                    "borderBottom": "1px solid rgba(255,255,255,0.10)",
                                    "borderLeft": "1px solid rgba(255,255,255,0.10)",
                                    "borderRight": "1px solid rgba(255,255,255,0.10)",
                                    "color": "rgba(255,255,255,0.88)",
                                    "padding": "6px 10px",
                                    "fontSize": "12px",
                                    "whiteSpace": "nowrap",
                                },
                            ),
                        ],
                        className="panel panel--table",
                    ),

                    html.Div(
                        [
                            html.Div("Political parties", className="table-title"),
                            dash_table.DataTable(
                                id="tbl-parties",
                                columns=[
                                    {"name": "Abbreviation", "id": "abbreviation"},
                                    {"name": "Party", "id": "political_party"},
                                ],
                                data=[],
                                sort_action="native",
                                page_size=16,
                                style_table={"overflowX": "auto"},
                                style_header={
                                    "fontWeight": 700,
                                    "fontSize": "12px",
                                    "backgroundColor": "rgba(15, 10, 49, 0.38)",
                                    "borderBottom": "1px solid rgba(255,255,255,0.10)",
                                    "color": "rgba(255,255,255,0.85)",
                                },
                                style_cell={
                                    "backgroundColor": "rgba(50, 49, 49, 0.40)",
                                    "borderBottom": "1px solid rgba(255,255,255,0.10)",
                                    "borderLeft": "1px solid rgba(255,255,255,0.10)",
                                    "borderRight": "1px solid rgba(255,255,255,0.10)",
                                    "color": "rgba(255,255,255,0.88)",
                                    "padding": "6px 10px",
                                    "fontSize": "12px",
                                    "whiteSpace": "normal",
                                    "height": "auto",
                                },
                                style_cell_conditional=[
                                    {"if": {"column_id": "abbreviation"}, "width": "110px", "maxWidth": "110px"},
                                ],
                            ),
                        ],
                        className="panel panel--table",
                    ),
                ],
                className="summary-tables",
            ),
        ],
        className="summary-wrap",
    )

# ----------------------------
# Layout
# ----------------------------
app.layout = html.Div(
    [
        dcc.Location(id="dashboard-location", refresh=False),
        dcc.Interval(id="boot", interval=80, n_intervals=0, max_intervals=1),

        html.Div(id="data-warning", className="alert", style={"display": "none"}),

        dcc.Store(id="store-options", data=None),
        dcc.Store(id="store-expanded", data=None),
        dcc.Store(id="store-active-row", data=None),

        dcc.Tabs(
            id="tabs",
            value="tab-search",
            children=[
                dcc.Tab(label="Search", value="tab-search", children=render_search_tab()),
                dcc.Tab(label="Summary", value="tab-summary", children=render_summary_tab()),
            ],
            className="tabs",
        ),

    ],
    className="page",
)



@app.callback(Output("tabs", "value"), Input("dashboard-location", "search"))
def select_initial_view(search):
    view = parse_qs((search or "").lstrip("?")).get("view", ["search"])[0]
    return "tab-summary" if view == "summary" else "tab-search"


app.validation_layout = html.Div(
    [
        app.layout,
        render_search_tab(),
        render_summary_tab(),
    ]
)
@app.callback(
    Output("tbl", "style_data_conditional"),
    Input("store-active-row", "data"),
)
def style_selected_row(active_row):
    base_bg = "rgba(50, 49, 49, 0.78)"
    base_border = "1px solid rgba(255,255,255,0.10)"
    base_color = "rgba(255,255,255,0.88)"
    selected_bg = "rgba(50, 49, 49, 0.38)"
    selected_border = "1px solid rgba(33,212,253,0.35)"

    styles = [
        # Disable the default active/selected cell highlight (pink)
        {
            "if": {"state": "active"},
            "backgroundColor": selected_bg,
            "border": selected_border,
            "color": "rgba(255,255,255,0.98)",
        },
        {
            "if": {"state": "selected"},
            "backgroundColor": selected_bg,
            "border": selected_border,
            "color": "rgba(255,255,255,0.98)",
        },

        # keep margin formatting
        {
            "if": {"column_id": "margin_pct"},
            "fontVariantNumeric": "tabular-nums",
        },
    ]

    if isinstance(active_row, int) and active_row >= 0:

        # whole row selected
        styles.append(
            {
                "if": {"row_index": active_row},
                "backgroundColor": selected_bg,
                "border": selected_border,
                "color": "rgba(255,255,255,0.98)",
            }
        )

        # keep selected row styling on hover
        styles.append(
            {
                "if": {"state": "hover", "row_index": active_row},
                "backgroundColor": selected_bg,
                "border": selected_border,
                "color": "rgba(255,255,255,0.98)",
            }
        )

        # ensure the active cell inside the selected row does NOT change colour
        styles.append(
            {
                "if": {"state": "active", "row_index": active_row},
                "backgroundColor": selected_bg,
                "border": selected_border,
                "color": "rgba(255,255,255,0.98)",
            }
        )

    return styles
@app.callback(
    Output("store-expanded", "data"),
    Output("store-active-row", "data"),
    Input("tbl", "active_cell"),
    Input("btn-close-details", "n_clicks"),
    Input("boot", "n_intervals"),
    Input("btn-reset-filters", "n_clicks"),
    State("tbl", "data"),
    State("store-expanded", "data"),
    prevent_initial_call=False,
)
def manage_expansion(active_cell, close_clicks, boot_intervals, reset_clicks, table_data, expanded_state):
    ctx = callback_context
    if not ctx.triggered:
        raise PreventUpdate

    trigger_id = ctx.triggered[0]["prop_id"].split(".")[0]

    if trigger_id == "boot":
        return None, None

    if trigger_id == "btn-reset-filters":
        if not reset_clicks:
            raise PreventUpdate
        return None, None

    if trigger_id == "btn-close-details":
        if not close_clicks:
            raise PreventUpdate
        return None, None

    if trigger_id == "tbl":
        if not active_cell or not table_data:
            raise PreventUpdate

        row_id = active_cell.get("row_id")
        if not row_id:
            raise PreventUpdate  # means your rows don't have "id" yet

        clicked = next((r for r in table_data if r.get("id") == row_id), None)
        if not clicked:
            raise PreventUpdate

        clicked_key = clicked.get("id")

        if expanded_state and expanded_state.get("key") == clicked_key:
            return no_update, no_update

        return (
            {"key": clicked_key, "year": clicked.get("year"), "constituency": clicked.get("constituency")},
            int(active_cell.get("row", 0)),  # keep for styling highlight
        )

    raise PreventUpdate

@app.callback(
    Output("right-pane", "style"),
    Output("left-pane", "style"),
    Input("store-expanded", "data"),
)
def toggle_split_layout(expanded_state):
    if not expanded_state:
        return (
            {"display": "none", "flex": "1 1 0%", "minWidth": "0"},
            {"flex": "1 1 100%", "width": "100%", "minWidth": "0"},
        )

    return (
        {"display": "block", "flex": "1 1 50%", "width": "50%", "minWidth": "0"},
        {"flex": "1 1 50%", "width": "50%", "minWidth": "0"},
    )

# ----------------------------
# Boot: load options
# ----------------------------
@app.callback(
    Output("store-options", "data"),
    Output("data-warning", "children"),
    Output("data-warning", "style"),
    Input("boot", "n_intervals"),
)
def boot_load_options(_n):
    try:
        data = backend_get_json("/api/dashboard/options")
        return data, "", {"display": "none"}
    except Exception:
        return None, "Election data is unavailable. Please try again later.", {
            "display": "block",
            "marginBottom": "12px",
        }


# ----------------------------
# Populate filters defaults (ALL years selected by default)
# ----------------------------

@app.callback(
    Output("dd-years", "options"),
    Output("dd-years", "value"),
    Output("dd-winners", "options"),
    Output("dd-winners", "value"),
    Output("dd-contesting", "options"),
    Output("dd-contesting", "value"),
    Output("dd-consts", "options"),
    Output("dd-consts", "value"),
    Input("store-options", "data"),
    Input("btn-reset-filters", "n_clicks"),
)
def init_filters(options_data, _reset_clicks):

    if not options_data:
        return [], [], [], [], [], [], [], []

    years = options_data.get("years", []) or []
    parties = options_data.get("parties", []) or []
    consts = options_data.get("constituencies", []) or []

    # years
    years_sorted = []
    for y in years:
        try:
            years_sorted.append(int(y))
        except Exception:
            pass
    years_sorted = sorted(list(set(years_sorted)))

    year_options = [{"label": "All years", "value": ALL_VALUE}]
    year_options.extend([{"label": str(y), "value": int(y)} for y in years_sorted])

    # parties
    party_options = [{"label": "All parties", "value": ALL_VALUE}]
    for p in parties:
        abbr = p.get("abbreviation")
        full_name = p.get("full_name") or ""
        if abbr:
            party_options.append({"label": f"{abbr} - {full_name}", "value": str(abbr)})

    contesting_options = list(party_options)

    # constituencies
    const_options = [{"label": "All Constituencies", "value": ALL_VALUE}]
    for c in consts:
        name = c.get("constituency")
        if name:
            const_options.append({"label": str(name), "value": str(name)})

    seen = set()
    deduped = []
    for opt in const_options:
        v = opt.get("value")
        if v in seen:
            continue
        seen.add(v)
        deduped.append(opt)

    # empty values = "All"
    return (
        year_options, [],
        party_options, [],
        contesting_options, [],
        deduped, []
    )
@app.callback(
    Output("tbl", "active_cell"),
    Output("tbl", "selected_cells"),
    Input("btn-close-details", "n_clicks"),
    Input("btn-reset-filters", "n_clicks"),
    Input("boot", "n_intervals"),
    prevent_initial_call=False,
)
def clear_table_focus(_close, _reset, _boot):
    return None, []



@app.callback(
    Output("dd-types", "value"),
    Input("btn-reset-filters", "n_clicks"),
    prevent_initial_call=True,
)
def reset_types(_n):
    return []

# ----------------------------
# Search + table + KPI 
# ----------------------------
@app.callback(
    Output("kpi-count", "children"),
    Output("tbl", "data"),
    Input("dd-years", "value"),
    Input("dd-winners", "value"),
    Input("dd-contesting", "value"),
    Input("dd-types", "value"),
    Input("dd-consts", "value"),
    State("store-options", "data"),
)
def update_table(years, winners, contesting, types, constituencies, options_data):
    if not options_data:
        return "—", []

    years = normalise_multi(years or [])
    winners = normalise_multi(winners or [])
    contesting = normalise_multi(contesting or [])
    types = normalise_multi(types or [])
    constituencies = normalise_multi(constituencies or [])

    years_for_query = values_for_query(years)
    winners_for_query = values_for_query(winners)
    contesting_for_query = values_for_query(contesting)
    types_for_query = values_for_query(types)
    consts_for_query = values_for_query(constituencies)

    params = {
        "years": to_csv(years_for_query),
        "winners": to_csv(winners_for_query),
        "types": to_csv(types_for_query),
        "constituencies": to_csv(consts_for_query),

        # optional backend support later; harmless now
        "contesting": to_csv(contesting_for_query),
    }

    try:
        resp = backend_get_json("/api/dashboard/search", params=params)
        rows = resp.get("rows", []) or []

        # --- Client-side filter: contesting party ---
        if contesting_for_query:
            wanted = set(str(x) for x in contesting_for_query)
            filtered = []

            for r in rows:
                contested_list = get_contesting_parties_from_row(r)
                contested_set = set(str(p) for p in contested_list)

                # keep row if ANY selected party contested here
                if contested_set.intersection(wanted):
                    filtered.append(r)

            rows = filtered

        party_map = {}
        for p in options_data.get("parties", []):
            abbr = p.get("abbreviation")
            full_name = p.get("full_name")
            if abbr:
                party_map[str(abbr)] = str(full_name or "")

        # KPI count (AFTER filtering)
        count = len(rows)

        # average turnout (AFTER filtering)
        turnout_vals = []
        for r in rows:
            t = r.get("turnout_pct")
            if t is None:
                continue
            try:
                turnout_vals.append(float(t))
            except Exception:
                pass

        # (you can display turnout somewhere later if you want)
        # turnout_txt = safe_pct(sum(turnout_vals)/len(turnout_vals), 3) if turnout_vals else "—"

        table_data = []

        for r in rows:
            year = r.get("year")
            constituency = r.get("constituency") or ""
            ctype = normalise_na(r.get("constituency_type"))
            winner = r.get("winner_party") or ""
            margin = r.get("margin_pct")

            contested_list = get_contesting_parties_from_row(r)

            row_key = f"{year}::{constituency}"  # any unique stable key

            table_data.append(
                {
                    "id": row_key,
                    "year": year,
                    "constituency": constituency,
                    "constituency_type": ctype,
                    "contested_parties": party_list_spans(contested_list, party_map),
                    "winner_party": party_span(winner, party_map),
                    "margin_pct": safe_pct(margin, digits=3),
                }
            )

        return str(len(rows)), table_data


    except Exception as e:
        import traceback
        print(traceback.format_exc(), flush=True)
        return "—", []

@app.callback(
    Output("tbl-election-dates", "data"),
    Output("tbl-parties", "data"),
    Input("store-options", "data"),
    Input("tabs", "value"),
)
def fill_summary_tables(options_data, tab_value):
    if tab_value != "tab-summary":
        raise PreventUpdate
    if not options_data:
        return [], []

    # Parties from options (already present)
    parties = options_data.get("parties", []) or []
    party_rows = []
    for p in parties:
        abbr = p.get("abbreviation")
        full = p.get("full_name") or p.get("political_party") or ""
        if abbr:
            party_rows.append({"abbreviation": abbr, "political_party": full})

    party_rows.sort(key=lambda r: str(r["abbreviation"]))

    # Dates: requires backend to include `election_dates` in options_data
    dates = options_data.get("election_dates", []) or []
    date_rows = []
    for d in dates:
        date_rows.append(
            {
                "year": d.get("year"),
                "nomination_day": format_pretty_date(d.get("nomination_day")),
                "polling_day": format_pretty_date(d.get("polling_day")),
            }
        )
    date_rows.sort(key=lambda r: int(r["year"]) if r.get("year") is not None else 0)

    return date_rows, party_rows

@app.callback(
    Output("details-panel", "children"),
    Output("details-panel", "style"),
    Input("store-expanded", "data"),
)
def render_details(expanded_state):
    if not expanded_state:
        return [], {"display": "none"}

    year = expanded_state.get("year")
    constituency = expanded_state.get("constituency")

    if not year or not constituency:
        return [], {"display": "none"}

    try:
        details = backend_get_json(
            "/api/dashboard/details",
            params={"year": year, "constituency": constituency},
        )

        parties = details.get("parties", [])
        elector = details.get("elector", None)

        vote_fig = build_vote_bar(parties)
        elector_fig = build_elector_pie(elector)
        candidates_block = parse_candidates(parties)

        header = html.Div(
            [
                html.Div(
                    f"{constituency} ({year})",
                    className="detail-title",
                ),
            ],
            className="detail-header detail-header--with-close",
        )


        content = html.Div(
            [
                html.Div(
                    [
                        dcc.Graph(
                            figure=vote_fig,
                            config={"displayModeBar": False},
                        )
                    ],
                    className="detail-card",
                ),

                html.Div(
                    [
                        dcc.Graph(
                            figure=elector_fig,
                            config={"displayModeBar": False},
                        )
                    ],
                    className="detail-card",
                ),

                html.Div(
                    [
                        html.Div("Candidates", className="detail-section-title"),
                        candidates_block,
                    ],
                    className="detail-card",
                ),
            ],
            className="detail-stack",
        )


        return [header, content], {"display": "block"}

    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print("\n=== [render_details] FAILED ===")
        print("year:", year, "constituency:", constituency)
        print(tb)

        return [
            html.Div("Failed to load details.", className="muted"),
            html.Pre(str(e), className="muted", style={"whiteSpace": "pre-wrap"}),
        ], {"display": "block"}


# ----------------------------
# Summary tab charts (client-side aggregation via /search)
# ----------------------------
@app.callback(
    Output("g-overall-winners", "figure"),
    Output("g-yearly-winners", "figure"),
    Input("tabs", "value"),
)
def build_summary(tab_value):
    if tab_value != "tab-summary":
        return FIG_LOADING_OVERALL, FIG_LOADING_YEARLY


    # Pull all rows (no filters) and aggregate
    try:
        resp = backend_get_json("/api/dashboard/search", params={})
        rows = resp.get("rows", [])

        # Overall winners
        overall = {}
        # Yearly winners
        yearly = {}

        for r in rows:
            year = r.get("year")
            winner = r.get("winner_party") or "—"

            overall[winner] = overall.get(winner, 0) + 1

            if year not in yearly:
                yearly[year] = {}
            yearly[year][winner] = yearly[year].get(winner, 0) + 1

        # Overall pie
        # Overall winners (count of constituencies won)
        overall = {}
        yearly = {}

        for r in rows:
            year = r.get("year")
            winner = r.get("winner_party") or "—"

            overall[winner] = overall.get(winner, 0) + 1

            if year not in yearly:
                yearly[year] = {}
            yearly[year][winner] = yearly[year].get(winner, 0) + 1

        # --- Overall: ranked horizontal bar (replaces pie) ---
        overall_items = sorted(overall.items(), key=lambda kv: kv[1], reverse=True)

        # Optional: keep top N to reduce clutter
        TOP_N = 12
        shown = overall_items[:TOP_N]
        others = overall_items[TOP_N:]

        labels = [k for (k, _v) in shown]
        values = [int(v) for (_k, v) in shown]

        if others:
            labels.append("Others")
            values.append(sum(int(v) for (_k, v) in others))

        used = set()
        bar_colors = []
        for p in labels:
            if p == "Others":
                bar_colors.append("rgba(255,255,255,0.28)")
            else:
                bar_colors.append(get_party_color(p, used))

        fig_overall = go.Figure(
            data=[
                go.Bar(
                    x=values,
                    y=labels,
                    orientation="h",
                    marker=dict(color=bar_colors),
                    hovertemplate="%{y}<br>Constituencies won: %{x}<extra></extra>",
                )
            ]
        )

        fig_overall.update_layout(
            yaxis=dict(autorange="reversed"),
            xaxis=dict(
                title="Constituencies won",
                gridcolor="rgba(255,255,255,0.08)",
                zerolinecolor="rgba(255,255,255,0.10)",
            ),
            yaxis_title="Party",
        )
        apply_dark_layout(fig_overall, "Overall: constituencies won by party", height=380)


        # Yearly stacked bar
        years_sorted = sorted([int(y) for y in yearly.keys()])
        parties = sorted(list(overall.keys()))

        # better ordering: show PAP/WP first in legend, then others alphabetically
        parties_sorted = []
        for p in ["PAP", "WP"]:
            if p in parties:
                parties_sorted.append(p)
        for p in parties:
            if p not in parties_sorted:
                parties_sorted.append(p)

        used = set()
        fig_yearly = go.Figure()

        for party in parties_sorted:
            y_counts = []
            for y in years_sorted:
                y_counts.append(int(yearly.get(y, {}).get(party, 0)))

            color = get_party_color(party, used)

            fig_yearly.add_trace(
                go.Bar(
                    name=party,
                    x=[str(y) for y in years_sorted],
                    y=y_counts,
                    marker=dict(color=color),
                    hovertemplate=f"{party}<br>Year: %{{x}}<br>Count: %{{y}}<extra></extra>",
                )
            )

        fig_yearly.update_layout(
            barmode="stack",
            xaxis=dict(
                title="Year",
                gridcolor="rgba(255,255,255,0.08)",
                zerolinecolor="rgba(255,255,255,0.10)",
            ),
            yaxis=dict(
                title="Constituencies won",
                gridcolor="rgba(255,255,255,0.08)",
                zerolinecolor="rgba(255,255,255,0.10)",
            ),
        )
        apply_dark_layout(fig_yearly, "Year-by-year: constituencies won", height=420)

        return fig_overall, fig_yearly

    except Exception:
        fig_overall = go.Figure()
        fig_overall.update_layout(title="Overall: failed to load")

        fig_yearly = go.Figure()
        fig_yearly.update_layout(title="Year-by-year: failed to load")

        return fig_overall, fig_yearly


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8050, debug=False)
