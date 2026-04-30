import { spawn } from 'node:child_process';

const DEFAULT_SSH_DIR = process.env.HOME ? `${process.env.HOME}/.ssh` : '/home/nextjs/.ssh';
const VOICE_SSH_TARGET = process.env.AI_RUNTIME_SSH_TARGET
  || process.env.INFRA_METRICS_SSH_TARGET
  || process.env.SCHEDULED_RESTART_SSH_TARGET
  || 'deploy@100.84.14.93';
const VOICE_SSH_KEY_PATH = process.env.AI_RUNTIME_SSH_KEY_PATH
  || process.env.INFRA_METRICS_SSH_KEY_PATH
  || `${DEFAULT_SSH_DIR}/id_ed25519`;
const VOICE_SSH_KNOWN_HOSTS_PATH = process.env.AI_RUNTIME_SSH_KNOWN_HOSTS_PATH
  || process.env.INFRA_METRICS_SSH_KNOWN_HOSTS_PATH
  || `${DEFAULT_SSH_DIR}/known_hosts`;

export type VoiceDomain = {
  domainUuid: string;
  domainName: string;
  enabled: boolean;
  description: string | null;
  insertDate: string | null;
  extensionCount: number;
  gatewayCount: number;
  callsToday: number;
  answerRate: number | null;
  status: 'active' | 'suspended' | 'inactive';
};

export type VoiceExtension = {
  extensionUuid: string;
  domainUuid: string;
  domainName: string | null;
  extension: string;
  callerIdName: string | null;
  device: string | null;
  voicemailEnabled: boolean;
  callForward: string | null;
  enabled: boolean;
  insertDate: string | null;
};

export type VoiceGateway = {
  gatewayUuid: string;
  domainUuid: string;
  domainName: string | null;
  gateway: string;
  proxy: string | null;
  registerEnabled: boolean;
  pingEnabled: boolean;
  enabled: boolean;
  insertDate: string | null;
};

export type VoiceCallFlowEntry = {
  uuid: string;
  type: 'IVR' | 'Ring Group' | 'Queue' | 'Call Flow';
  name: string;
  extension: string | null;
  domainUuid: string;
  domainName: string | null;
  enabled: boolean;
  updatedAt: string | null;
};

export type VoiceCallRow = {
  uuid: string;
  callerName: string | null;
  callerNumber: string | null;
  destination: string | null;
  domainName: string | null;
  startStamp: string | null;
  durationSec: number | null;
  status: string | null;
  direction: string | null;
};

export type VoiceRecordingRow = {
  uuid: string;
  callerNumber: string | null;
  destination: string | null;
  domainName: string | null;
  startStamp: string | null;
  durationSec: number | null;
  recordName: string | null;
};

export type VoiceAnalytics = {
  volumeDaily: { date: string; total: number; answered: number }[];
  callsByHour: { hour: number; total: number }[];
  outcomes: { answered: number; missed: number; voicemail: number; failed: number; total: number };
  topDomains: { domainName: string; total: number; answered: number; avgDurationSec: number }[];
  totalsLast7d: { total: number; answered: number; missed: number; avgDurationSec: number; peakConcurrent: number };
};

export type VoiceFreeswitchLive = {
  available: boolean;
  registrations: number | null;
  sofiaProfiles: { name: string; state: string | null }[];
  rawStatus: string | null;
};

export type VoiceConsoleExtras = {
  collectedAt: string;
  dbAvailable: boolean;
  dbError: string | null;
  domains: VoiceDomain[];
  extensions: VoiceExtension[];
  gateways: VoiceGateway[];
  callFlows: VoiceCallFlowEntry[];
  callFlowCounts: { ivrMenus: number; ringGroups: number; queues: number; callFlows: number; timeConditions: number };
  calls: { recent: VoiceCallRow[]; recordings: VoiceRecordingRow[]; activeNow: number; queuedNow: number };
  analytics: VoiceAnalytics;
  freeswitch: VoiceFreeswitchLive;
};

function runRemoteScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'ssh',
      [
        '-i',
        VOICE_SSH_KEY_PATH,
        '-o',
        `UserKnownHostsFile=${VOICE_SSH_KNOWN_HOSTS_PATH}`,
        '-o',
        'StrictHostKeyChecking=yes',
        VOICE_SSH_TARGET,
        'bash',
        '-s',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'], env: process.env },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || stdout.trim() || `ssh exited with code ${code}`));
    });
    child.stdin.end(script);
  });
}

export function emptyVoiceConsoleExtras(errorMessage?: string): VoiceConsoleExtras {
  return {
    collectedAt: new Date().toISOString(),
    dbAvailable: false,
    dbError: errorMessage ?? null,
    domains: [],
    extensions: [],
    gateways: [],
    callFlows: [],
    callFlowCounts: { ivrMenus: 0, ringGroups: 0, queues: 0, callFlows: 0, timeConditions: 0 },
    calls: { recent: [], recordings: [], activeNow: 0, queuedNow: 0 },
    analytics: {
      volumeDaily: [],
      callsByHour: [],
      outcomes: { answered: 0, missed: 0, voicemail: 0, failed: 0, total: 0 },
      topDomains: [],
      totalsLast7d: { total: 0, answered: 0, missed: 0, avgDurationSec: 0, peakConcurrent: 0 },
    },
    freeswitch: { available: false, registrations: null, sofiaProfiles: [], rawStatus: null },
  };
}

export async function getVoiceConsoleExtras(): Promise<VoiceConsoleExtras> {
  try {
    const output = await runRemoteScript(String.raw`
set -euo pipefail

python3 - <<'PY'
import json
import subprocess

VOICE_DB = "voice"
PG_CONTAINER = "getouch-postgres"
FS_CONTAINER = "voice-freeswitch"

def run(args, timeout=12):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        return result.returncode, result.stdout, result.stderr
    except Exception as exc:  # noqa: BLE001
        return 1, "", str(exc)

def psql_json(sql):
    code, out, _err = run(["docker", "exec", PG_CONTAINER, "psql", "-U", "getouch", "-d", VOICE_DB, "-Atc", sql])
    if code != 0:
        return None
    txt = (out or "").strip()
    if not txt:
        return []
    try:
        return json.loads(txt)
    except Exception:
        return None

def regclass_exists(table):
    code, out, _err = run(["docker", "exec", PG_CONTAINER, "psql", "-U", "getouch", "-d", VOICE_DB, "-Atc",
                            f"select to_regclass('public.{table}') is not null"])
    return code == 0 and (out or "").strip() == "t"

result = {
    "dbAvailable": False,
    "dbError": None,
    "domains": [],
    "extensions": [],
    "gateways": [],
    "callFlows": [],
    "callFlowCounts": {"ivrMenus": 0, "ringGroups": 0, "queues": 0, "callFlows": 0, "timeConditions": 0},
    "calls": {"recent": [], "recordings": [], "activeNow": 0, "queuedNow": 0},
    "analytics": {
        "volumeDaily": [],
        "callsByHour": [],
        "outcomes": {"answered": 0, "missed": 0, "voicemail": 0, "failed": 0, "total": 0},
        "topDomains": [],
        "totalsLast7d": {"total": 0, "answered": 0, "missed": 0, "avgDurationSec": 0, "peakConcurrent": 0},
    },
    "freeswitch": {"available": False, "registrations": None, "sofiaProfiles": [], "rawStatus": None},
}

# Probe DB
code, out, err = run(["docker", "exec", PG_CONTAINER, "psql", "-U", "getouch", "-d", VOICE_DB, "-Atc", "select 1"])
if code != 0:
    result["dbError"] = (err or out or "psql probe failed").strip().splitlines()[-1] if (err or out) else "psql probe failed"
    print(json.dumps(result))
    raise SystemExit(0)
result["dbAvailable"] = True

if regclass_exists("v_domains"):
    sql = """
    select coalesce(json_agg(t order by t.domain_name), '[]'::json) from (
      select
        d.domain_uuid::text as domain_uuid,
        d.domain_name as domain_name,
        d.domain_enabled = 'true' as enabled,
        d.domain_description as description,
        to_char(d.insert_date at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as insert_date,
        coalesce((select count(*) from v_extensions e where e.domain_uuid = d.domain_uuid), 0) as extension_count,
        coalesce((select count(*) from v_gateways g where g.domain_uuid = d.domain_uuid), 0) as gateway_count,
        coalesce((select count(*) from v_xml_cdr c
                  where c.domain_uuid = d.domain_uuid and c.start_stamp >= now()::date), 0) as calls_today,
        (select round(100.0 * count(*) filter (where lower(coalesce(call_disposition,'')) in ('answered','normal_clearing'))::numeric
                    / nullif(count(*),0), 1)
         from v_xml_cdr c
         where c.domain_uuid = d.domain_uuid and c.start_stamp >= now() - interval '7 days') as answer_rate
      from v_domains d
    ) t;
    """
    domains = psql_json(sql) or []
    for d in domains:
        result["domains"].append({
            "domainUuid": d["domain_uuid"],
            "domainName": d["domain_name"],
            "enabled": bool(d["enabled"]),
            "description": d.get("description"),
            "insertDate": d.get("insert_date"),
            "extensionCount": int(d["extension_count"] or 0),
            "gatewayCount": int(d["gateway_count"] or 0),
            "callsToday": int(d["calls_today"] or 0),
            "answerRate": float(d["answer_rate"]) if d.get("answer_rate") is not None else None,
            "status": "active" if d["enabled"] else "suspended",
        })

if regclass_exists("v_extensions"):
    sql = """
    select coalesce(json_agg(t order by t.extension), '[]'::json) from (
      select
        e.extension_uuid::text as extension_uuid,
        e.domain_uuid::text as domain_uuid,
        d.domain_name as domain_name,
        e.extension as extension,
        e.effective_caller_id_name as caller_id_name,
        coalesce(e.user_record, '') as user_record,
        coalesce(e.missed_call_data, '') as missed_call_data,
        coalesce(e.missed_call_app, '') as missed_call_app,
        e.enabled = 'true' as enabled,
        to_char(e.insert_date at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as insert_date
      from v_extensions e
      left join v_domains d on d.domain_uuid = e.domain_uuid
      order by e.extension
      limit 200
    ) t;
    """
    rows = psql_json(sql) or []
    for r in rows:
        result["extensions"].append({
            "extensionUuid": r["extension_uuid"],
            "domainUuid": r["domain_uuid"],
            "domainName": r.get("domain_name"),
            "extension": r["extension"],
            "callerIdName": r.get("caller_id_name"),
            "device": None,
            "voicemailEnabled": bool((r.get("user_record") or "").lower() in ("all","inbound","outbound","local")),
            "callForward": r.get("missed_call_data") or None,
            "enabled": bool(r["enabled"]),
            "insertDate": r.get("insert_date"),
        })

if regclass_exists("v_gateways"):
    sql = """
    select coalesce(json_agg(t order by t.gateway), '[]'::json) from (
      select
        g.gateway_uuid::text as gateway_uuid,
        g.domain_uuid::text as domain_uuid,
        d.domain_name as domain_name,
        g.gateway as gateway,
        g.proxy as proxy,
        coalesce(g.register, 'false') = 'true' as register_enabled,
        coalesce(g.ping, '') <> '' as ping_enabled,
        g.enabled = 'true' as enabled,
        to_char(g.insert_date at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as insert_date
      from v_gateways g
      left join v_domains d on d.domain_uuid = g.domain_uuid
      order by g.gateway
      limit 200
    ) t;
    """
    rows = psql_json(sql) or []
    for r in rows:
        result["gateways"].append({
            "gatewayUuid": r["gateway_uuid"],
            "domainUuid": r["domain_uuid"],
            "domainName": r.get("domain_name"),
            "gateway": r["gateway"],
            "proxy": r.get("proxy"),
            "registerEnabled": bool(r["register_enabled"]),
            "pingEnabled": bool(r["ping_enabled"]),
            "enabled": bool(r["enabled"]),
            "insertDate": r.get("insert_date"),
        })

# Call flow counts
def count(table):
    if not regclass_exists(table):
        return 0
    code, out, _err = run(["docker", "exec", PG_CONTAINER, "psql", "-U", "getouch", "-d", VOICE_DB, "-Atc", f"select count(*) from public.{table}"])
    try:
        return int((out or "0").strip())
    except Exception:
        return 0

result["callFlowCounts"]["ivrMenus"] = count("v_ivr_menus")
result["callFlowCounts"]["ringGroups"] = count("v_ring_groups")
result["callFlowCounts"]["queues"] = count("v_call_center_queues")
result["callFlowCounts"]["callFlows"] = count("v_call_flows")
# Time conditions are stored as dialplan apps in FusionPBX; approximate:
if regclass_exists("v_dialplans"):
    code, out, _err = run(["docker", "exec", PG_CONTAINER, "psql", "-U", "getouch", "-d", VOICE_DB, "-Atc",
                            "select count(*) from v_dialplans where dialplan_name ilike '%time%condition%' or app_uuid is not null and dialplan_xml ilike '%time-of-day%'"])
    try:
        result["callFlowCounts"]["timeConditions"] = int((out or "0").strip())
    except Exception:
        result["callFlowCounts"]["timeConditions"] = 0

# Combined call flow list
union_sources = []
if regclass_exists("v_ivr_menus"):
    union_sources.append("""
        select 'IVR'::text as type, ivr_menu_uuid::text as uuid, ivr_menu_name as name,
               ivr_menu_extension as extension, domain_uuid::text as domain_uuid,
               coalesce(ivr_menu_enabled,'false') = 'true' as enabled,
               coalesce(update_date, insert_date) as updated_at
        from v_ivr_menus
    """)
if regclass_exists("v_ring_groups"):
    union_sources.append("""
        select 'Ring Group'::text, ring_group_uuid::text, ring_group_name,
               ring_group_extension, domain_uuid::text,
               coalesce(ring_group_enabled,'false') = 'true',
               coalesce(update_date, insert_date)
        from v_ring_groups
    """)
if regclass_exists("v_call_center_queues"):
    union_sources.append("""
        select 'Queue'::text, call_center_queue_uuid::text, queue_name,
               queue_extension, domain_uuid::text,
               true,
               coalesce(update_date, insert_date)
        from v_call_center_queues
    """)
if regclass_exists("v_call_flows"):
    union_sources.append("""
        select 'Call Flow'::text, call_flow_uuid::text, call_flow_name,
               call_flow_extension, domain_uuid::text,
               coalesce(call_flow_enabled,'false') = 'true',
               coalesce(update_date, insert_date)
        from v_call_flows
    """)

if union_sources:
    union_sql = " union all ".join(union_sources)
    sql = f"""
    select coalesce(json_agg(t order by t.updated_at desc nulls last, t.name), '[]'::json) from (
      select s.type, s.uuid, s.name, s.extension, s.domain_uuid,
             d.domain_name, s.enabled,
             to_char(s.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
      from ({union_sql}) s(type, uuid, name, extension, domain_uuid, enabled, updated_at)
      left join v_domains d on d.domain_uuid::text = s.domain_uuid
      order by updated_at desc nulls last
      limit 100
    ) t;
    """
    rows = psql_json(sql) or []
    for r in rows:
        result["callFlows"].append({
            "uuid": r["uuid"],
            "type": r["type"],
            "name": r["name"],
            "extension": r.get("extension"),
            "domainUuid": r["domain_uuid"],
            "domainName": r.get("domain_name"),
            "enabled": bool(r["enabled"]),
            "updatedAt": r.get("updated_at"),
        })

# Calls / CDR
if regclass_exists("v_xml_cdr"):
    sql = """
    select coalesce(json_agg(t order by t.start_stamp desc nulls last), '[]'::json) from (
      select c.xml_cdr_uuid::text as uuid,
             c.caller_id_name as caller_name,
             c.caller_id_number as caller_number,
             c.destination_number as destination,
             c.domain_name as domain_name,
             to_char(c.start_stamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as start_stamp,
             c.duration as duration_sec,
             c.call_disposition as status,
             c.direction as direction
      from v_xml_cdr c
      order by c.start_stamp desc nulls last
      limit 50
    ) t;
    """
    rows = psql_json(sql) or []
    result["calls"]["recent"] = [{
        "uuid": r["uuid"],
        "callerName": r.get("caller_name"),
        "callerNumber": r.get("caller_number"),
        "destination": r.get("destination"),
        "domainName": r.get("domain_name"),
        "startStamp": r.get("start_stamp"),
        "durationSec": int(r["duration_sec"]) if r.get("duration_sec") is not None else None,
        "status": r.get("status"),
        "direction": r.get("direction"),
    } for r in rows]

    sql = """
    select coalesce(json_agg(t order by t.start_stamp desc nulls last), '[]'::json) from (
      select c.xml_cdr_uuid::text as uuid,
             c.caller_id_number as caller_number,
             c.destination_number as destination,
             c.domain_name as domain_name,
             to_char(c.start_stamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as start_stamp,
             c.duration as duration_sec,
             c.record_name as record_name
      from v_xml_cdr c
      where c.record_name is not null and c.record_name <> ''
      order by c.start_stamp desc nulls last
      limit 50
    ) t;
    """
    rows = psql_json(sql) or []
    result["calls"]["recordings"] = [{
        "uuid": r["uuid"],
        "callerNumber": r.get("caller_number"),
        "destination": r.get("destination"),
        "domainName": r.get("domain_name"),
        "startStamp": r.get("start_stamp"),
        "durationSec": int(r["duration_sec"]) if r.get("duration_sec") is not None else None,
        "recordName": r.get("record_name"),
    } for r in rows]

    sql = """
    select coalesce(json_agg(t order by t.day), '[]'::json) from (
      with days as (
        select generate_series((now()::date - interval '6 days'), now()::date, interval '1 day')::date as day
      )
      select to_char(d.day,'YYYY-MM-DD') as day,
             coalesce(count(c.xml_cdr_uuid),0) as total,
             coalesce(count(c.xml_cdr_uuid) filter (where lower(coalesce(c.call_disposition,'')) in ('answered','normal_clearing')),0) as answered
      from days d
      left join v_xml_cdr c on c.start_stamp >= d.day and c.start_stamp < d.day + interval '1 day'
      group by d.day
      order by d.day
    ) t;
    """
    rows = psql_json(sql) or []
    result["analytics"]["volumeDaily"] = [
        {"date": r["day"], "total": int(r["total"]), "answered": int(r["answered"])}
        for r in rows
    ]

    sql = """
    select coalesce(json_agg(t order by t.hour), '[]'::json) from (
      with hours as (select generate_series(0,23) as hour)
      select h.hour,
             coalesce(count(c.xml_cdr_uuid),0) as total
      from hours h
      left join v_xml_cdr c on extract(hour from c.start_stamp) = h.hour
                          and c.start_stamp >= now() - interval '7 days'
      group by h.hour
      order by h.hour
    ) t;
    """
    rows = psql_json(sql) or []
    result["analytics"]["callsByHour"] = [{"hour": int(r["hour"]), "total": int(r["total"])} for r in rows]

    sql = """
    select json_build_object(
      'answered', coalesce(count(*) filter (where lower(coalesce(call_disposition,'')) in ('answered','normal_clearing')),0),
      'missed',   coalesce(count(*) filter (where coalesce(missed_call,'false') = 'true' or lower(coalesce(call_disposition,'')) in ('no_answer','no answer','originator_cancel')),0),
      'voicemail',coalesce(count(*) filter (where coalesce(voicemail_message,'false') = 'true'),0),
      'failed',   coalesce(count(*) filter (where lower(coalesce(call_disposition,'')) in ('failed','user_busy','call_rejected','recovery_on_timer_expire')),0),
      'total',    coalesce(count(*),0)
    )::text
    from v_xml_cdr where start_stamp >= now() - interval '7 days';
    """
    code, out, _err = run(["docker", "exec", PG_CONTAINER, "psql", "-U", "getouch", "-d", VOICE_DB, "-Atc", sql])
    if code == 0 and out.strip():
        try:
            result["analytics"]["outcomes"] = json.loads(out.strip())
        except Exception:
            pass

    sql = """
    select coalesce(json_agg(t order by t.total desc), '[]'::json) from (
      select coalesce(c.domain_name, 'unknown') as domain_name,
             count(*) as total,
             count(*) filter (where lower(coalesce(c.call_disposition,'')) in ('answered','normal_clearing')) as answered,
             coalesce(round(avg(c.duration))::int,0) as avg_duration_sec
      from v_xml_cdr c
      where c.start_stamp >= now() - interval '7 days'
      group by 1
      order by total desc
      limit 5
    ) t;
    """
    rows = psql_json(sql) or []
    result["analytics"]["topDomains"] = [
        {"domainName": r["domain_name"], "total": int(r["total"]),
         "answered": int(r["answered"]), "avgDurationSec": int(r["avg_duration_sec"])}
        for r in rows
    ]

    sql = """
    select json_build_object(
      'total', coalesce(count(*),0),
      'answered', coalesce(count(*) filter (where lower(coalesce(call_disposition,'')) in ('answered','normal_clearing')),0),
      'missed', coalesce(count(*) filter (where coalesce(missed_call,'false') = 'true'),0),
      'avgDurationSec', coalesce(round(avg(duration))::int,0),
      'peakConcurrent', 0
    )::text
    from v_xml_cdr where start_stamp >= now() - interval '7 days';
    """
    code, out, _err = run(["docker", "exec", PG_CONTAINER, "psql", "-U", "getouch", "-d", VOICE_DB, "-Atc", sql])
    if code == 0 and out.strip():
        try:
            result["analytics"]["totalsLast7d"] = json.loads(out.strip())
        except Exception:
            pass

# FreeSWITCH live status (best-effort; may fail without ESL)
fs_code, fs_out, _fs_err = run(["docker", "exec", FS_CONTAINER, "sh", "-lc", "fs_cli -x 'sofia status' 2>/dev/null"], timeout=8)
if fs_code == 0 and fs_out.strip():
    result["freeswitch"]["available"] = True
    result["freeswitch"]["rawStatus"] = fs_out.strip()[:4000]
    profiles = []
    for line in fs_out.splitlines():
        parts = line.split()
        if len(parts) >= 3 and parts[1] == "profile":
            profiles.append({"name": parts[2], "state": "running"})
    result["freeswitch"]["sofiaProfiles"] = profiles[:20]
    reg_code, reg_out, _reg_err = run(["docker", "exec", FS_CONTAINER, "sh", "-lc",
                                        "fs_cli -x 'show registrations' 2>/dev/null | tail -n 1"], timeout=8)
    if reg_code == 0 and reg_out.strip():
        m = reg_out.strip().split()
        try:
            result["freeswitch"]["registrations"] = int(m[0])
        except Exception:
            pass

print(json.dumps(result))
PY
`);
    const parsed = JSON.parse(output);
    return {
      collectedAt: new Date().toISOString(),
      dbAvailable: Boolean(parsed.dbAvailable),
      dbError: parsed.dbError ?? null,
      domains: parsed.domains ?? [],
      extensions: parsed.extensions ?? [],
      gateways: parsed.gateways ?? [],
      callFlows: parsed.callFlows ?? [],
      callFlowCounts: parsed.callFlowCounts ?? { ivrMenus: 0, ringGroups: 0, queues: 0, callFlows: 0, timeConditions: 0 },
      calls: parsed.calls ?? { recent: [], recordings: [], activeNow: 0, queuedNow: 0 },
      analytics: parsed.analytics ?? emptyVoiceConsoleExtras().analytics,
      freeswitch: parsed.freeswitch ?? { available: false, registrations: null, sofiaProfiles: [], rawStatus: null },
    };
  } catch (error) {
    return emptyVoiceConsoleExtras(error instanceof Error ? error.message : 'Unable to read voice DB');
  }
}
