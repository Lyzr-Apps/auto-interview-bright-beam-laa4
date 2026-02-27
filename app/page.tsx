'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { useRAGKnowledgeBase } from '@/lib/ragKnowledgeBase'
import {
  listSchedules,
  getScheduleLogs,
  pauseSchedule,
  resumeSchedule,
  triggerScheduleNow,
  cronToHuman,
} from '@/lib/scheduler'
import type { Schedule, ExecutionLog } from '@/lib/scheduler'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Loader2, Search, Send, Upload, FileText, Trash2, Play, Pause,
  RefreshCw, Clock, Calendar, Mail, Zap, Eye, Check,
  X, ChevronRight, ChevronDown, AlertTriangle,
  Sparkles, Shield, Globe, Target, Star, BarChart3,
  ArrowRight, Terminal, MonitorDot, Archive, Briefcase
} from 'lucide-react'

// ============================================================================
// CONSTANTS
// ============================================================================

const AGENT_IDS = {
  cvStrategist: '69a1465196a057bf406904c2',
  jobScout: '69a1465282720469d8e74b37',
  applicationCrafter: '69a146522ffb8028d20a2151',
  outreachAgent: '69a14664d863768503c9bb56',
  jobHuntCoordinator: '69a1469082720469d8e74b3c',
  interviewScheduler: '69a1469030b61d72bfe62b52',
  telegramNotifier: '69a146913fa1c5bfc0e93e4a',
}

const RAG_ID = '69a1461e00c2d274880effbc'
const SCHEDULE_ID_INITIAL = '69a1469825d4d77f732eaeef'

const AGENT_INFO: Record<string, { name: string; purpose: string }> = {
  [AGENT_IDS.cvStrategist]: { name: 'CV Strategist', purpose: 'Analyzes CV, extracts strategy profile' },
  [AGENT_IDS.jobScout]: { name: 'Job Scout', purpose: 'Searches job boards for matches' },
  [AGENT_IDS.applicationCrafter]: { name: 'App Crafter', purpose: 'Generates cover letters & applications' },
  [AGENT_IDS.outreachAgent]: { name: 'Outreach', purpose: 'Sends personalized recruiter emails' },
  [AGENT_IDS.jobHuntCoordinator]: { name: 'Coordinator', purpose: 'Orchestrates daily job hunt cycle' },
  [AGENT_IDS.interviewScheduler]: { name: 'Interview Sched.', purpose: 'Negotiates & schedules interviews' },
  [AGENT_IDS.telegramNotifier]: { name: 'Telegram', purpose: 'Sends notifications & approvals' },
}

const THEME_VARS = {
  '--background': '120 15% 3%',
  '--foreground': '120 100% 50%',
  '--card': '120 12% 5%',
  '--card-foreground': '120 100% 50%',
  '--primary': '120 100% 45%',
  '--primary-foreground': '120 15% 3%',
  '--secondary': '120 20% 10%',
  '--secondary-foreground': '120 90% 55%',
  '--muted': '120 15% 12%',
  '--muted-foreground': '120 60% 35%',
  '--border': '120 50% 20%',
  '--input': '120 30% 15%',
  '--destructive': '0 100% 50%',
  '--destructive-foreground': '120 15% 3%',
  '--accent': '120 100% 40%',
  '--accent-foreground': '120 15% 3%',
  '--ring': '120 100% 45%',
  '--radius': '0rem',
} as Record<string, string>

// ============================================================================
// TYPES
// ============================================================================

interface ActivityEntry {
  id: string
  timestamp: string
  agentId: string
  agentName: string
  action: string
  status: 'success' | 'error' | 'pending'
}

interface KanbanJob {
  id: string
  company: string
  role: string
  status: 'DISCOVERED' | 'APPLIED' | 'CONTACTED' | 'REPLIED' | 'INTERVIEW' | 'DONE'
  matchScore?: number
  channel?: string
}

interface CVProfile {
  target_roles?: string[]
  key_strengths?: string[]
  differentiators?: string[]
  experience_years?: string
  top_skills?: string[]
  strategy_summary?: string
  recommended_channels?: string[]
  salary_positioning?: string
  cv_gaps?: string[]
  quick_fixes?: string[]
}

interface CoordinatorResult {
  cycle_date?: string
  jobs_found?: number
  applications_sent?: number
  emails_sent?: number
  pending_approvals?: number
  high_priority_jobs?: Array<{
    title?: string
    company?: string
    match_score?: number
    status?: string
    action_taken?: string
  }>
  outreach_summary?: string
  daily_summary?: string
  next_actions?: string[]
}

interface OutreachTarget {
  name?: string
  company?: string
  role?: string
  email_subject?: string
  email_status?: string
  sequence_stage?: string
}

interface ApplicationEntry {
  job_title?: string
  company?: string
  cover_letter?: string
  application_message?: string
  highlighted_projects?: string[]
  key_alignment_points?: string[]
}

interface InterviewResult {
  interview_scheduled?: boolean
  company?: string
  role?: string
  interview_date?: string
  interview_time?: string
  interview_format?: string
  interviewer?: string
  calendar_event_created?: boolean
  reply_sent?: boolean
  notes?: string
  status?: string
}

// ============================================================================
// SAMPLE DATA
// ============================================================================

const SAMPLE_ACTIVITY: ActivityEntry[] = [
  { id: '1', timestamp: '08:01', agentId: AGENT_IDS.jobScout, agentName: 'Job Scout', action: 'Found 12 new matching roles across 8 companies', status: 'success' },
  { id: '2', timestamp: '08:03', agentId: AGENT_IDS.applicationCrafter, agentName: 'App Crafter', action: 'Crafted 5 personalized applications for high-priority matches', status: 'success' },
  { id: '3', timestamp: '08:05', agentId: AGENT_IDS.outreachAgent, agentName: 'Outreach', action: 'Sent 3 cold outreach emails to recruiters at Stripe, Vercel, Linear', status: 'success' },
  { id: '4', timestamp: '08:06', agentId: AGENT_IDS.telegramNotifier, agentName: 'Telegram', action: 'Notified user: 2 jobs require approval before applying', status: 'pending' },
  { id: '5', timestamp: '07:45', agentId: AGENT_IDS.cvStrategist, agentName: 'CV Strategist', action: 'Updated strategy profile with new ML certification', status: 'success' },
]

const SAMPLE_KANBAN: KanbanJob[] = [
  { id: 'j1', company: 'Stripe', role: 'Senior SWE', status: 'DISCOVERED', matchScore: 95, channel: 'Direct Apply' },
  { id: 'j2', company: 'Vercel', role: 'Staff Engineer', status: 'APPLIED', matchScore: 92, channel: 'LinkedIn' },
  { id: 'j3', company: 'Linear', role: 'Backend Lead', status: 'CONTACTED', matchScore: 88, channel: 'Recruiter' },
  { id: 'j4', company: 'Notion', role: 'Platform Eng', status: 'REPLIED', matchScore: 85 },
  { id: 'j5', company: 'Figma', role: 'Infra Engineer', status: 'INTERVIEW', matchScore: 90 },
  { id: 'j6', company: 'Datadog', role: 'SRE Lead', status: 'DISCOVERED', matchScore: 87 },
  { id: 'j7', company: 'Cloudflare', role: 'Systems Eng', status: 'APPLIED', matchScore: 84 },
  { id: 'j8', company: 'Supabase', role: 'Eng Manager', status: 'DONE', matchScore: 91 },
]

const SAMPLE_CV: CVProfile = {
  target_roles: ['Senior Software Engineer', 'Staff Engineer', 'Engineering Manager'],
  key_strengths: ['10 years distributed systems', 'Led team of 15', 'Open source contributor'],
  differentiators: ['Published research on ML infrastructure', 'Built systems serving 100M users'],
  experience_years: '10',
  top_skills: ['Python', 'Go', 'Kubernetes', 'System Design', 'Team Leadership'],
  strategy_summary: 'Target senior IC and EM roles at Series B+ startups and FAANG. Lead with distributed systems expertise and team leadership experience.',
  recommended_channels: ['LinkedIn Direct Apply', 'Recruiter Outreach', 'AngelList', 'Company Career Pages'],
  salary_positioning: '$180K-$250K base for IC, $200K-$280K for EM roles',
  cv_gaps: ['No formal ML certification despite ML experience', 'Career gap in 2022'],
  quick_fixes: ['Add ML certification from Coursera', 'Frame 2022 gap as sabbatical/consulting'],
}

const SAMPLE_COORDINATOR: CoordinatorResult = {
  cycle_date: '2026-02-27',
  jobs_found: 12,
  applications_sent: 5,
  emails_sent: 3,
  pending_approvals: 2,
  high_priority_jobs: [
    { title: 'Senior Software Engineer', company: 'Stripe', match_score: 95, status: 'Applied', action_taken: 'Submitted personalized application' },
    { title: 'Staff Engineer', company: 'Vercel', match_score: 92, status: 'Outreach Sent', action_taken: 'Cold email to hiring manager' },
  ],
  outreach_summary: 'Sent 3 personalized outreach emails to recruiters at target companies.',
  daily_summary: 'Productive day: 12 jobs found, 5 applications sent, 3 outreach emails dispatched. 2 items pending your approval.',
  next_actions: ['Follow up with Stripe recruiter', 'Prepare for Figma interview', 'Review Notion response'],
}

const SAMPLE_APPLICATIONS: ApplicationEntry[] = [
  {
    job_title: 'Senior Software Engineer',
    company: 'Stripe',
    cover_letter: 'Dear Hiring Team, I am excited to apply for the Senior Software Engineer role at Stripe...',
    application_message: 'Experienced distributed systems engineer with 10 years building payment infrastructure...',
    highlighted_projects: ['Built real-time payment processing system', 'Open source Kubernetes operator'],
    key_alignment_points: ['Payment infrastructure experience', 'Scale expertise matching Stripe needs'],
  },
  {
    job_title: 'Staff Engineer',
    company: 'Vercel',
    cover_letter: 'Dear Vercel Engineering Team, As a passionate advocate for developer experience...',
    application_message: 'Full-stack platform engineer specializing in build systems and edge computing...',
    highlighted_projects: ['Edge runtime optimization framework', 'CI/CD pipeline serving 50K deploys/day'],
    key_alignment_points: ['Edge computing expertise', 'Developer tooling background'],
  },
]

const SAMPLE_OUTREACH: OutreachTarget[] = [
  { name: 'Jane Smith', company: 'Stripe', role: 'Engineering Recruiter', email_subject: 'Re: Senior Engineer Role', email_status: 'Sent', sequence_stage: 'Intro' },
  { name: 'Mike Chen', company: 'Vercel', role: 'Hiring Manager', email_subject: 'Staff Engineer - Systems Background', email_status: 'Sent', sequence_stage: 'Intro' },
  { name: 'Sarah Lee', company: 'Linear', role: 'VP Engineering', email_subject: 'Backend Lead - Distributed Systems', email_status: 'Sent', sequence_stage: 'Intro' },
]

const SAMPLE_INTERVIEWS: InterviewResult[] = [
  { interview_scheduled: true, company: 'Figma', role: 'Infra Engineer', interview_date: '2026-03-05', interview_time: '10:00 AM PT', interview_format: 'Video - System Design', interviewer: 'Alex Johnson', calendar_event_created: true, reply_sent: true, notes: 'Prepare system design for real-time collaboration', status: 'Confirmed' },
]

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return <h4 key={i} className="font-semibold text-sm mt-3 mb-1 phosphor-glow">{line.slice(4)}</h4>
        if (line.startsWith('## '))
          return <h3 key={i} className="font-semibold text-base mt-3 mb-1 phosphor-glow">{line.slice(3)}</h3>
        if (line.startsWith('# '))
          return <h2 key={i} className="font-bold text-lg mt-4 mb-2 phosphor-glow">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* '))
          return <li key={i} className="ml-4 list-disc text-sm">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line))
          return <li key={i} className="ml-4 list-decimal text-sm">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm">{formatInline(line)}</p>
      })}
    </div>
  )
}

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part
  )
}

function getTimeStr(): string {
  const now = new Date()
  return now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function getDateStr(): string {
  const now = new Date()
  return now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' })
}

// ============================================================================
// ERROR BOUNDARY
// ============================================================================

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground font-mono">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">SYSTEM ERROR</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button onClick={() => this.setState({ hasError: false, error: '' })}
              className="px-4 py-2 bg-primary text-primary-foreground text-sm font-mono">
              RETRY
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ============================================================================
// INLINE COMPONENTS
// ============================================================================

function MetricCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="border border-border bg-card p-3 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-muted-foreground text-xs tracking-wider uppercase">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-bold phosphor-glow tracking-wider">{value}</div>
    </div>
  )
}

function AgentBadge({ agentId }: { agentId: string }) {
  const info = AGENT_INFO[agentId]
  if (!info) return <Badge variant="outline" className="font-mono text-xs">UNKNOWN</Badge>
  return (
    <Badge variant="outline" className="font-mono text-xs border-border text-foreground">
      {info.name}
    </Badge>
  )
}

function StatusDot({ status }: { status: 'success' | 'error' | 'pending' | 'active' | 'idle' }) {
  const colors: Record<string, string> = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    pending: 'bg-yellow-500',
    active: 'bg-green-500 animate-pulse',
    idle: 'bg-muted-foreground',
  }
  return <span className={`inline-block w-2 h-2 ${colors[status] ?? 'bg-muted-foreground'}`} />
}

function KanbanColumn({ title, jobs, count }: { title: string; jobs: KanbanJob[]; count: number }) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="text-xs tracking-wider text-muted-foreground flex items-center gap-1">
        <span>{title}</span>
        <span className="text-foreground">[{count}]</span>
      </div>
      <div className="space-y-1">
        {jobs.map((job) => (
          <div key={job.id} className="border border-border bg-secondary p-2 text-xs">
            <div className="font-semibold truncate">{job.company ?? 'Unknown'}</div>
            <div className="text-muted-foreground truncate">{job.role ?? 'N/A'}</div>
            {(job.matchScore ?? 0) > 0 && (
              <div className="text-xs mt-1">{job.matchScore}% match</div>
            )}
          </div>
        ))}
        {count === 0 && <div className="text-xs text-muted-foreground border border-dashed border-border p-2 text-center">--</div>}
      </div>
    </div>
  )
}

function SkillBar({ skill, level }: { skill: string; level: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 truncate">{skill}</span>
      <div className="flex-1 h-2 bg-secondary border border-border">
        <div className="h-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, level))}%` }} />
      </div>
      <span className="w-8 text-right text-muted-foreground">{level}%</span>
    </div>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function Page() {
  // ---- State ----
  const [activeTab, setActiveTab] = useState('mission')
  const [sampleMode, setSampleMode] = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState('')
  const [currentDate, setCurrentDate] = useState('')

  // Mission Control state
  const [commandInput, setCommandInput] = useState('')
  const [commandResponse, setCommandResponse] = useState('')
  const [commandLoading, setCommandLoading] = useState(false)
  const [activityFeed, setActivityFeed] = useState<ActivityEntry[]>([])
  const [kanbanJobs, setKanbanJobs] = useState<KanbanJob[]>([])
  const [metrics, setMetrics] = useState({ jobsFound: 0, appsSent: 0, replies: 0, interviews: 0, pending: 0 })
  const [coordinatorData, setCoordinatorData] = useState<CoordinatorResult | null>(null)

  // Schedule state
  const [scheduleId, setScheduleId] = useState(SCHEDULE_ID_INITIAL)
  const [scheduleData, setScheduleData] = useState<Schedule | null>(null)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleLogs, setScheduleLogs] = useState<ExecutionLog[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const [scheduleStatus, setScheduleStatus] = useState('')

  // CV Strategy state
  const [cvProfile, setCvProfile] = useState<CVProfile | null>(null)
  const [cvLoading, setCvLoading] = useState(false)
  const [cvStatus, setCvStatus] = useState('')
  const ragHook = useRAGKnowledgeBase()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Archive state
  const [applications, setApplications] = useState<ApplicationEntry[]>([])
  const [outreachTargets, setOutreachTargets] = useState<OutreachTarget[]>([])
  const [interviews, setInterviews] = useState<InterviewResult[]>([])
  const [archiveSearch, setArchiveSearch] = useState('')
  const [expandedApp, setExpandedApp] = useState<number | null>(null)

  // Outreach form
  const [outreachForm, setOutreachForm] = useState({ recipientName: '', email: '', company: '', role: '', context: '' })
  const [outreachLoading, setOutreachLoading] = useState(false)
  const [outreachStatus, setOutreachStatus] = useState('')

  // Interview form
  const [interviewForm, setInterviewForm] = useState({ recruiterEmail: '', threadContext: '', availability: '' })
  const [interviewLoading, setInterviewLoading] = useState(false)
  const [interviewStatus, setInterviewStatus] = useState('')

  // ---- Schedule handlers ----
  const loadSchedule = useCallback(async () => {
    setScheduleLoading(true)
    const result = await listSchedules()
    if (result.success) {
      const found = result.schedules.find((s) => s.id === scheduleId)
      if (found) {
        setScheduleData(found)
      } else if (result.schedules.length > 0) {
        const coordSchedule = result.schedules.find((s) => s.agent_id === AGENT_IDS.jobHuntCoordinator)
        if (coordSchedule) {
          setScheduleData(coordSchedule)
          setScheduleId(coordSchedule.id)
        }
      }
    }
    setScheduleLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleId])

  // ---- Effects ----
  useEffect(() => {
    setCurrentTime(getTimeStr())
    setCurrentDate(getDateStr())
    const timer = setInterval(() => {
      setCurrentTime(getTimeStr())
      setCurrentDate(getDateStr())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    loadSchedule()
  }, [loadSchedule])

  useEffect(() => {
    if (sampleMode) {
      setActivityFeed(SAMPLE_ACTIVITY)
      setKanbanJobs(SAMPLE_KANBAN)
      setMetrics({ jobsFound: 12, appsSent: 5, replies: 2, interviews: 1, pending: 2 })
      setCoordinatorData(SAMPLE_COORDINATOR)
      setCvProfile(SAMPLE_CV)
      setApplications(SAMPLE_APPLICATIONS)
      setOutreachTargets(SAMPLE_OUTREACH)
      setInterviews(SAMPLE_INTERVIEWS)
    } else {
      setActivityFeed([])
      setKanbanJobs([])
      setMetrics({ jobsFound: 0, appsSent: 0, replies: 0, interviews: 0, pending: 0 })
      setCoordinatorData(null)
      setCvProfile(null)
      setApplications([])
      setOutreachTargets([])
      setInterviews([])
    }
  }, [sampleMode])

  const ragFetchRef = useRef(false)
  useEffect(() => {
    if (!ragFetchRef.current) {
      ragFetchRef.current = true
      ragHook.fetchDocuments(RAG_ID)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleToggleSchedule = async () => {
    if (!scheduleId) return
    setScheduleLoading(true)
    setScheduleStatus('')
    if (scheduleData?.is_active) {
      const res = await pauseSchedule(scheduleId)
      setScheduleStatus(res.success ? 'Schedule paused' : `Error: ${res.error ?? 'Failed'}`)
    } else {
      const res = await resumeSchedule(scheduleId)
      setScheduleStatus(res.success ? 'Schedule activated' : `Error: ${res.error ?? 'Failed'}`)
    }
    await loadSchedule()
    setScheduleLoading(false)
  }

  const handleTriggerNow = async () => {
    if (!scheduleId) return
    setScheduleLoading(true)
    const res = await triggerScheduleNow(scheduleId)
    setScheduleStatus(res.success ? 'Triggered -- executing now' : `Error: ${res.error ?? 'Failed'}`)
    setScheduleLoading(false)
  }

  const handleLoadLogs = async () => {
    if (!scheduleId) return
    setScheduleLoading(true)
    const res = await getScheduleLogs(scheduleId, { limit: 10 })
    if (res.success) {
      setScheduleLogs(res.executions)
    }
    setShowLogs(true)
    setScheduleLoading(false)
  }

  // ---- Agent call helpers ----
  const addActivity = (agentId: string, action: string, status: 'success' | 'error' | 'pending') => {
    const info = AGENT_INFO[agentId]
    setActivityFeed((prev) => [{
      id: Date.now().toString(),
      timestamp: getTimeStr(),
      agentId,
      agentName: info?.name ?? 'Unknown',
      action,
      status,
    }, ...prev].slice(0, 50))
  }

  // Command bar handler
  const handleCommand = async () => {
    if (!commandInput.trim()) return
    setCommandLoading(true)
    setCommandResponse('')
    setActiveAgentId(AGENT_IDS.jobHuntCoordinator)
    addActivity(AGENT_IDS.jobHuntCoordinator, `Command: ${commandInput}`, 'pending')

    const result = await callAIAgent(commandInput, AGENT_IDS.jobHuntCoordinator)
    setActiveAgentId(null)

    if (result.success) {
      const data = result?.response?.result
      if (data) {
        const coord = data as CoordinatorResult
        setCoordinatorData(coord)
        setMetrics({
          jobsFound: coord.jobs_found ?? 0,
          appsSent: coord.applications_sent ?? 0,
          replies: coord.emails_sent ?? 0,
          interviews: 0,
          pending: coord.pending_approvals ?? 0,
        })

        const hpJobs = Array.isArray(coord.high_priority_jobs) ? coord.high_priority_jobs : []
        if (hpJobs.length > 0) {
          const newKanbanJobs: KanbanJob[] = hpJobs.map((j, idx) => ({
            id: `cmd-${Date.now()}-${idx}`,
            company: j.company ?? 'Unknown',
            role: j.title ?? 'N/A',
            status: mapStatus(j.status),
            matchScore: j.match_score,
          }))
          setKanbanJobs((prev) => [...newKanbanJobs, ...prev])
        }

        const summary = coord.daily_summary ?? coord.outreach_summary ?? ''
        setCommandResponse(summary || JSON.stringify(data, null, 2))
        addActivity(AGENT_IDS.jobHuntCoordinator, `Cycle complete: ${coord.jobs_found ?? 0} jobs, ${coord.applications_sent ?? 0} apps`, 'success')
      } else {
        const msg = result?.response?.message ?? 'Command processed'
        setCommandResponse(msg)
        addActivity(AGENT_IDS.jobHuntCoordinator, msg, 'success')
      }
    } else {
      const errMsg = result?.error ?? 'Command failed'
      setCommandResponse(`ERROR: ${errMsg}`)
      addActivity(AGENT_IDS.jobHuntCoordinator, errMsg, 'error')
    }

    setCommandLoading(false)
    setCommandInput('')
  }

  function mapStatus(st?: string): KanbanJob['status'] {
    if (!st) return 'DISCOVERED'
    const lower = st.toLowerCase()
    if (lower.includes('applied') || lower.includes('submitted')) return 'APPLIED'
    if (lower.includes('contact') || lower.includes('outreach')) return 'CONTACTED'
    if (lower.includes('repl')) return 'REPLIED'
    if (lower.includes('interview')) return 'INTERVIEW'
    if (lower.includes('done') || lower.includes('accepted') || lower.includes('offer')) return 'DONE'
    return 'DISCOVERED'
  }

  // CV Upload handler
  const handleCVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCvLoading(true)
    setCvStatus('Uploading CV to knowledge base...')

    const uploadResult = await ragHook.uploadDocument(RAG_ID, file)
    if (uploadResult.success) {
      setCvStatus('CV uploaded. Analyzing...')
      await handleAnalyzeCV()
    } else {
      setCvStatus(`Upload failed: ${uploadResult.error ?? 'Unknown error'}`)
      setCvLoading(false)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleAnalyzeCV = async () => {
    setCvLoading(true)
    setCvStatus('Running CV analysis...')
    setActiveAgentId(AGENT_IDS.cvStrategist)
    addActivity(AGENT_IDS.cvStrategist, 'Analyzing uploaded CV', 'pending')

    const result = await callAIAgent(
      'Analyze the uploaded CV and provide a comprehensive strategy profile including target roles, key strengths, differentiators, top skills, strategy summary, recommended channels, salary positioning, CV gaps, and quick fixes.',
      AGENT_IDS.cvStrategist
    )
    setActiveAgentId(null)

    if (result.success) {
      const data = result?.response?.result as CVProfile | undefined
      if (data) {
        setCvProfile(data)
        setCvStatus('Analysis complete')
        addActivity(AGENT_IDS.cvStrategist, 'CV analysis complete', 'success')
      } else {
        setCvStatus('Analysis returned empty data')
        addActivity(AGENT_IDS.cvStrategist, 'Analysis returned empty', 'error')
      }
    } else {
      setCvStatus(`Analysis failed: ${result?.error ?? 'Unknown'}`)
      addActivity(AGENT_IDS.cvStrategist, 'Analysis failed', 'error')
    }
    setCvLoading(false)
  }

  const handleDeleteDoc = async (fileName: string) => {
    await ragHook.removeDocuments(RAG_ID, [fileName])
  }

  // Outreach handler
  const handleOutreach = async () => {
    if (!outreachForm.email || !outreachForm.recipientName) return
    setOutreachLoading(true)
    setOutreachStatus('')
    setActiveAgentId(AGENT_IDS.outreachAgent)
    addActivity(AGENT_IDS.outreachAgent, `Sending outreach to ${outreachForm.recipientName} at ${outreachForm.company}`, 'pending')

    const message = `Send a personalized cold outreach email to ${outreachForm.recipientName} at ${outreachForm.email}. They work at ${outreachForm.company} as ${outreachForm.role}. Context: ${outreachForm.context}`
    const result = await callAIAgent(message, AGENT_IDS.outreachAgent)
    setActiveAgentId(null)

    if (result.success) {
      const data = result?.response?.result
      const targets = Array.isArray(data?.outreach_targets) ? data.outreach_targets : []
      if (targets.length > 0) {
        setOutreachTargets((prev) => [...targets, ...prev])
      }
      setOutreachStatus(`Outreach sent: ${data?.emails_sent ?? 1} email(s)`)
      addActivity(AGENT_IDS.outreachAgent, `Outreach sent to ${outreachForm.recipientName}`, 'success')
      setOutreachForm({ recipientName: '', email: '', company: '', role: '', context: '' })
    } else {
      setOutreachStatus(`Failed: ${result?.error ?? 'Unknown error'}`)
      addActivity(AGENT_IDS.outreachAgent, 'Outreach failed', 'error')
    }
    setOutreachLoading(false)
  }

  // Interview scheduler handler
  const handleScheduleInterview = async () => {
    if (!interviewForm.recruiterEmail || !interviewForm.threadContext) return
    setInterviewLoading(true)
    setInterviewStatus('')
    setActiveAgentId(AGENT_IDS.interviewScheduler)
    addActivity(AGENT_IDS.interviewScheduler, `Scheduling interview via ${interviewForm.recruiterEmail}`, 'pending')

    const message = `Check email thread with ${interviewForm.recruiterEmail} regarding: ${interviewForm.threadContext}. My availability: ${interviewForm.availability || 'Flexible, any weekday 9am-5pm'}. Negotiate interview time, confirm the slot, and create a Google Calendar event.`
    const result = await callAIAgent(message, AGENT_IDS.interviewScheduler)
    setActiveAgentId(null)

    if (result.success) {
      const data = result?.response?.result as InterviewResult | undefined
      if (data) {
        setInterviews((prev) => [data, ...prev])
        setInterviewStatus(data.interview_scheduled ? `Interview scheduled at ${data.company ?? 'company'}` : `Status: ${data.status ?? 'Processing'}`)
        addActivity(AGENT_IDS.interviewScheduler, `Interview ${data.interview_scheduled ? 'scheduled' : 'processing'}: ${data.company ?? ''}`, data.interview_scheduled ? 'success' : 'pending')
      }
      setInterviewForm({ recruiterEmail: '', threadContext: '', availability: '' })
    } else {
      setInterviewStatus(`Failed: ${result?.error ?? 'Unknown'}`)
      addActivity(AGENT_IDS.interviewScheduler, 'Interview scheduling failed', 'error')
    }
    setInterviewLoading(false)
  }

  // ---- Kanban Helpers ----
  const kanbanStatuses: KanbanJob['status'][] = ['DISCOVERED', 'APPLIED', 'CONTACTED', 'REPLIED', 'INTERVIEW', 'DONE']
  const getKanbanJobs = (status: KanbanJob['status']) => kanbanJobs.filter((j) => j.status === status)

  // ---- Filtered applications ----
  const filteredApplications = applications.filter((app) => {
    const matchSearch = archiveSearch
      ? (app.company?.toLowerCase().includes(archiveSearch.toLowerCase()) || app.job_title?.toLowerCase().includes(archiveSearch.toLowerCase()))
      : true
    return matchSearch
  })

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <ErrorBoundary>
      <div style={THEME_VARS as React.CSSProperties} className="min-h-screen bg-background text-foreground font-mono crt-scanlines crt-flicker">
        {/* HEADER */}
        <div className="border-b border-border bg-card px-4 py-3">
          <div className="max-w-[1400px] mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Terminal className="w-5 h-5" />
              <h1 className="text-lg tracking-wider phosphor-glow-strong font-bold">
                AUTOHIRE <span className="text-muted-foreground">//</span> MISSION CONTROL
              </h1>
              <span className="terminal-cursor text-foreground" />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs">
                <Label htmlFor="sampleToggle" className="text-muted-foreground tracking-wider text-xs font-mono cursor-pointer">SAMPLE DATA</Label>
                <Switch id="sampleToggle" checked={sampleMode} onCheckedChange={setSampleMode} />
              </div>
              <Separator orientation="vertical" className="h-4" />
              <div className="text-xs text-muted-foreground tracking-wider">
                <span>{currentDate}</span> <span className="text-foreground phosphor-glow">{currentTime}</span>
              </div>
            </div>
          </div>
        </div>

        {/* TAB NAV */}
        <div className="border-b border-border bg-card px-4">
          <div className="max-w-[1400px] mx-auto">
            <div className="flex gap-0">
              {[
                { key: 'mission', label: 'MISSION_CTRL', num: '1', icon: <MonitorDot className="w-3.5 h-3.5" /> },
                { key: 'cv', label: 'CV_STRATEGY', num: '2', icon: <FileText className="w-3.5 h-3.5" /> },
                { key: 'archive', label: 'ARCHIVE', num: '3', icon: <Archive className="w-3.5 h-3.5" /> },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2.5 text-xs tracking-wider flex items-center gap-2 border-b-2 transition-colors ${activeTab === tab.key ? 'border-primary bg-primary text-primary-foreground font-bold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  {tab.icon}
                  <span>[{tab.num}]</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* CONTENT */}
        <div className="max-w-[1400px] mx-auto p-4">
          {/* ============================================================ */}
          {/* TAB 1: MISSION CONTROL */}
          {/* ============================================================ */}
          {activeTab === 'mission' && (
            <div className="space-y-4">
              {/* Metrics Bar */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <MetricCard label="Jobs Found" value={metrics.jobsFound} icon={<Search className="w-3.5 h-3.5" />} />
                <MetricCard label="Apps Sent" value={metrics.appsSent} icon={<Send className="w-3.5 h-3.5" />} />
                <MetricCard label="Emails Out" value={metrics.replies} icon={<Mail className="w-3.5 h-3.5" />} />
                <MetricCard label="Interviews" value={metrics.interviews} icon={<Calendar className="w-3.5 h-3.5" />} />
                <MetricCard label="Pending" value={metrics.pending} icon={<AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />} />
              </div>

              {/* Quick Command Bar */}
              <Card className="border-border bg-card">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground text-sm phosphor-glow font-bold">&gt;</span>
                    <Input
                      value={commandInput}
                      onChange={(e) => setCommandInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCommand()}
                      placeholder="Enter command... (e.g. 'Execute daily job hunt cycle')"
                      className="flex-1 bg-transparent border-none text-foreground placeholder:text-muted-foreground focus-visible:ring-0 font-mono text-sm"
                    />
                    <Button
                      onClick={handleCommand}
                      disabled={commandLoading || !commandInput.trim()}
                      size="sm"
                      className="font-mono text-xs tracking-wider"
                    >
                      {commandLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                  {commandResponse && (
                    <div className="mt-2 p-2 border border-border bg-secondary text-xs terminal-scroll max-h-40 overflow-y-auto">
                      <div className="text-muted-foreground mb-1">[COORDINATOR OUTPUT]</div>
                      {renderMarkdown(commandResponse)}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Schedule Management + Main Content */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* Left: Activity Feed */}
                <div className="lg:col-span-3 space-y-4">
                  {/* Schedule Panel */}
                  <Card className="border-border bg-card">
                    <CardHeader className="p-3 pb-2">
                      <CardTitle className="text-xs tracking-wider flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5" />
                        SCHEDULE MANAGEMENT
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                          <StatusDot status={scheduleData?.is_active ? 'active' : 'idle'} />
                          <span className="text-xs tracking-wider">
                            {scheduleData?.is_active ? 'ACTIVE' : 'PAUSED'}
                          </span>
                        </div>
                        <Separator orientation="vertical" className="h-4" />
                        <div className="text-xs text-muted-foreground">
                          {scheduleData?.cron_expression ? cronToHuman(scheduleData.cron_expression) : 'Loading...'}
                          {scheduleData?.timezone ? ` (${scheduleData.timezone})` : ''}
                        </div>
                        <Separator orientation="vertical" className="h-4" />
                        <div className="text-xs text-muted-foreground">
                          Next: {scheduleData?.next_run_time ? new Date(scheduleData.next_run_time).toLocaleString() : '--'}
                        </div>
                        <div className="flex-1" />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={scheduleData?.is_active ? 'destructive' : 'default'}
                            onClick={handleToggleSchedule}
                            disabled={scheduleLoading}
                            className="text-xs tracking-wider font-mono"
                          >
                            {scheduleLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : scheduleData?.is_active ? <Pause className="w-3 h-3 mr-1" /> : <Play className="w-3 h-3 mr-1" />}
                            {scheduleData?.is_active ? 'PAUSE' : 'ACTIVATE'}
                          </Button>
                          <Button size="sm" variant="outline" onClick={handleTriggerNow} disabled={scheduleLoading} className="text-xs tracking-wider font-mono">
                            <Zap className="w-3 h-3 mr-1" />
                            RUN NOW
                          </Button>
                          <Button size="sm" variant="outline" onClick={handleLoadLogs} disabled={scheduleLoading} className="text-xs tracking-wider font-mono">
                            <Eye className="w-3 h-3 mr-1" />
                            LOGS
                          </Button>
                          <Button size="sm" variant="outline" onClick={loadSchedule} disabled={scheduleLoading} className="text-xs tracking-wider font-mono">
                            <RefreshCw className={`w-3 h-3 ${scheduleLoading ? 'animate-spin' : ''}`} />
                          </Button>
                        </div>
                      </div>
                      {scheduleStatus && (
                        <div className="mt-2 text-xs text-muted-foreground border border-border p-1.5 bg-secondary">
                          {scheduleStatus}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Run Logs Dialog */}
                  {showLogs && (
                    <Card className="border-border bg-card">
                      <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-xs tracking-wider">EXECUTION LOGS</CardTitle>
                        <Button size="sm" variant="ghost" onClick={() => setShowLogs(false)} className="h-6 w-6 p-0">
                          <X className="w-3 h-3" />
                        </Button>
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <ScrollArea className="max-h-48 terminal-scroll">
                          {scheduleLogs.length === 0 && <div className="text-xs text-muted-foreground">No execution logs found</div>}
                          {scheduleLogs.map((log) => (
                            <div key={log.id} className="flex items-center gap-2 py-1 border-b border-border text-xs">
                              <StatusDot status={log.success ? 'success' : 'error'} />
                              <span className="text-muted-foreground">{new Date(log.executed_at).toLocaleString()}</span>
                              <span className="truncate flex-1">{log.success ? 'Success' : log.error_message ?? 'Failed'}</span>
                              <span className="text-muted-foreground">Attempt {log.attempt}/{log.max_attempts}</span>
                            </div>
                          ))}
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  )}

                  {/* Live Activity Feed */}
                  <Card className="border-border bg-card">
                    <CardHeader className="p-3 pb-2">
                      <CardTitle className="text-xs tracking-wider flex items-center gap-2">
                        <BarChart3 className="w-3.5 h-3.5" />
                        LIVE ACTIVITY FEED
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <ScrollArea className="h-64 terminal-scroll">
                        {activityFeed.length === 0 && (
                          <div className="text-xs text-muted-foreground text-center py-8">
                            No activity yet. Send a command or enable Sample Data to see the feed.
                          </div>
                        )}
                        {activityFeed.map((entry) => (
                          <div key={entry.id} className="flex items-start gap-2 py-1.5 border-b border-border">
                            <span className="text-xs text-muted-foreground w-14 flex-shrink-0">{entry.timestamp}</span>
                            <StatusDot status={entry.status} />
                            <AgentBadge agentId={entry.agentId} />
                            <span className="text-xs flex-1">{entry.action}</span>
                          </div>
                        ))}
                      </ScrollArea>
                    </CardContent>
                  </Card>

                  {/* Coordinator Summary */}
                  {coordinatorData && (
                    <Card className="border-border bg-card">
                      <CardHeader className="p-3 pb-2">
                        <CardTitle className="text-xs tracking-wider">COORDINATOR DAILY SUMMARY</CardTitle>
                        {coordinatorData.cycle_date && (
                          <CardDescription className="text-xs text-muted-foreground font-mono">{coordinatorData.cycle_date}</CardDescription>
                        )}
                      </CardHeader>
                      <CardContent className="p-3 pt-0 space-y-2">
                        {coordinatorData.daily_summary && (
                          <div className="text-xs">{renderMarkdown(coordinatorData.daily_summary)}</div>
                        )}
                        {coordinatorData.outreach_summary && (
                          <div className="text-xs text-muted-foreground">{coordinatorData.outreach_summary}</div>
                        )}
                        {Array.isArray(coordinatorData.next_actions) && coordinatorData.next_actions.length > 0 && (
                          <div>
                            <div className="text-xs text-muted-foreground mb-1 tracking-wider">NEXT ACTIONS:</div>
                            <ul className="space-y-0.5">
                              {coordinatorData.next_actions.map((action, i) => (
                                <li key={i} className="text-xs flex items-center gap-1">
                                  <ChevronRight className="w-3 h-3 text-primary" />
                                  {action}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Right: Kanban */}
                <div className="lg:col-span-2">
                  <Card className="border-border bg-card h-full">
                    <CardHeader className="p-3 pb-2">
                      <CardTitle className="text-xs tracking-wider flex items-center gap-2">
                        <Briefcase className="w-3.5 h-3.5" />
                        PIPELINE KANBAN
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <ScrollArea className="terminal-scroll">
                        <div className="grid grid-cols-2 gap-3">
                          {kanbanStatuses.map((status) => (
                            <KanbanColumn
                              key={status}
                              title={status}
                              jobs={getKanbanJobs(status)}
                              count={getKanbanJobs(status).length}
                            />
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Pending Actions */}
              {metrics.pending > 0 && Array.isArray(coordinatorData?.high_priority_jobs) && (
                <Card className="border-yellow-700 bg-card">
                  <CardHeader className="p-3 pb-2">
                    <CardTitle className="text-xs tracking-wider flex items-center gap-2 text-yellow-500">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      PENDING APPROVALS [{metrics.pending}]
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 space-y-2">
                    {coordinatorData?.high_priority_jobs?.filter((j) => j.status?.toLowerCase().includes('pending') || j.action_taken?.toLowerCase().includes('pending')).map((job, i) => (
                      <div key={i} className="flex items-center justify-between border border-yellow-800 p-2">
                        <div className="text-xs">
                          <span className="font-semibold">{job.company ?? 'Unknown'}</span>
                          <span className="text-muted-foreground"> - {job.title ?? 'N/A'}</span>
                          <span className="ml-2 text-yellow-500">{job.action_taken ?? ''}</span>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="default" className="h-6 text-xs font-mono tracking-wider" onClick={async () => {
                            setActiveAgentId(AGENT_IDS.telegramNotifier)
                            await callAIAgent(`Approve application for ${job.title} at ${job.company}. Send approval notification.`, AGENT_IDS.telegramNotifier)
                            setActiveAgentId(null)
                            addActivity(AGENT_IDS.telegramNotifier, `Approved: ${job.title} at ${job.company}`, 'success')
                          }}>
                            <Check className="w-3 h-3 mr-1" />APPROVE
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-xs font-mono tracking-wider" onClick={async () => {
                            setActiveAgentId(AGENT_IDS.telegramNotifier)
                            await callAIAgent(`Reject application for ${job.title} at ${job.company}. Send rejection notification.`, AGENT_IDS.telegramNotifier)
                            setActiveAgentId(null)
                            addActivity(AGENT_IDS.telegramNotifier, `Rejected: ${job.title} at ${job.company}`, 'success')
                          }}>
                            <X className="w-3 h-3 mr-1" />REJECT
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 2: CV STRATEGY PROFILE */}
          {/* ============================================================ */}
          {activeTab === 'cv' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Upload Zone */}
                <div className="space-y-4">
                  <Card className="border-border bg-card">
                    <CardHeader className="p-3 pb-2">
                      <CardTitle className="text-xs tracking-wider flex items-center gap-2">
                        <Upload className="w-3.5 h-3.5" />
                        CV UPLOAD
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 space-y-3">
                      <div
                        className="border-2 border-dashed border-border p-6 text-center cursor-pointer hover:border-primary transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                        <div className="text-xs text-muted-foreground tracking-wider">DROP CV HERE OR CLICK</div>
                        <div className="text-xs text-muted-foreground mt-1">PDF, DOCX, TXT</div>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.docx,.txt"
                        className="hidden"
                        onChange={handleCVUpload}
                      />
                      <Button
                        onClick={handleAnalyzeCV}
                        disabled={cvLoading}
                        className="w-full font-mono text-xs tracking-wider"
                      >
                        {cvLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Sparkles className="w-3.5 h-3.5 mr-2" />}
                        ANALYZE CV
                      </Button>
                      {cvStatus && (
                        <div className="text-xs text-muted-foreground border border-border p-1.5 bg-secondary">{cvStatus}</div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Uploaded Documents */}
                  <Card className="border-border bg-card">
                    <CardHeader className="p-3 pb-2">
                      <CardTitle className="text-xs tracking-wider flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5" />
                        KB DOCUMENTS
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      {ragHook.loading && <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Loading...</div>}
                      {ragHook.error && <div className="text-xs text-red-500">{ragHook.error}</div>}
                      {Array.isArray(ragHook.documents) && ragHook.documents.length === 0 && (
                        <div className="text-xs text-muted-foreground text-center py-4">No documents uploaded</div>
                      )}
                      {Array.isArray(ragHook.documents) && ragHook.documents.map((doc, i) => (
                        <div key={i} className="flex items-center justify-between py-1 border-b border-border text-xs">
                          <div className="flex items-center gap-1 truncate flex-1">
                            <FileText className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            <span className="truncate">{doc.fileName}</span>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 w-5 p-0"
                            onClick={() => handleDeleteDoc(doc.fileName)}
                          >
                            <Trash2 className="w-3 h-3 text-red-500" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 w-full text-xs tracking-wider font-mono"
                        onClick={() => ragHook.fetchDocuments(RAG_ID)}
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        REFRESH
                      </Button>
                    </CardContent>
                  </Card>
                </div>

                {/* Profile Display */}
                <div className="lg:col-span-2 space-y-4">
                  {!cvProfile && !cvLoading && (
                    <Card className="border-border bg-card">
                      <CardContent className="p-8 text-center">
                        <Shield className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                        <div className="text-sm tracking-wider mb-2">NO STRATEGY PROFILE</div>
                        <div className="text-xs text-muted-foreground">Upload a CV and click ANALYZE to generate your strategy profile.</div>
                      </CardContent>
                    </Card>
                  )}

                  {cvLoading && (
                    <Card className="border-border bg-card">
                      <CardContent className="p-8 text-center">
                        <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin" />
                        <div className="text-xs tracking-wider">ANALYZING CV...</div>
                      </CardContent>
                    </Card>
                  )}

                  {cvProfile && !cvLoading && (
                    <>
                      {/* Target Roles */}
                      <Card className="border-border bg-card">
                        <CardHeader className="p-3 pb-2">
                          <CardTitle className="text-xs tracking-wider flex items-center gap-2">
                            <Target className="w-3.5 h-3.5" />
                            TARGET ROLES
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                          <div className="flex flex-wrap gap-1.5">
                            {Array.isArray(cvProfile.target_roles) && cvProfile.target_roles.map((role, i) => (
                              <Badge key={i} variant="outline" className="font-mono text-xs">{role}</Badge>
                            ))}
                          </div>
                          {cvProfile.experience_years && (
                            <div className="text-xs text-muted-foreground mt-2">{cvProfile.experience_years} years experience</div>
                          )}
                        </CardContent>
                      </Card>

                      {/* Skills + Strengths */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card className="border-border bg-card">
                          <CardHeader className="p-3 pb-2">
                            <CardTitle className="text-xs tracking-wider">SKILLS MATRIX</CardTitle>
                          </CardHeader>
                          <CardContent className="p-3 pt-0 space-y-1.5">
                            {Array.isArray(cvProfile.top_skills) && cvProfile.top_skills.map((skill, i) => (
                              <SkillBar key={i} skill={skill} level={95 - i * 8} />
                            ))}
                          </CardContent>
                        </Card>

                        <Card className="border-border bg-card">
                          <CardHeader className="p-3 pb-2">
                            <CardTitle className="text-xs tracking-wider flex items-center gap-2">
                              <Check className="w-3.5 h-3.5" />
                              KEY STRENGTHS
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-3 pt-0">
                            <ul className="space-y-1">
                              {Array.isArray(cvProfile.key_strengths) && cvProfile.key_strengths.map((s, i) => (
                                <li key={i} className="text-xs flex items-start gap-1.5">
                                  <Check className="w-3 h-3 mt-0.5 text-primary flex-shrink-0" />
                                  {s}
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Differentiators */}
                      <Card className="border-border bg-card">
                        <CardHeader className="p-3 pb-2">
                          <CardTitle className="text-xs tracking-wider flex items-center gap-2">
                            <Star className="w-3.5 h-3.5" />
                            DIFFERENTIATORS
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                          <ul className="space-y-1">
                            {Array.isArray(cvProfile.differentiators) && cvProfile.differentiators.map((d, i) => (
                              <li key={i} className="text-xs flex items-start gap-1.5">
                                <Sparkles className="w-3 h-3 mt-0.5 text-primary flex-shrink-0" />
                                {d}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>

                      {/* Strategy Summary */}
                      {cvProfile.strategy_summary && (
                        <Card className="border-border bg-card">
                          <CardHeader className="p-3 pb-2">
                            <CardTitle className="text-xs tracking-wider">STRATEGY SUMMARY</CardTitle>
                          </CardHeader>
                          <CardContent className="p-3 pt-0">
                            <div className="text-xs">{renderMarkdown(cvProfile.strategy_summary)}</div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Channels + Salary */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card className="border-border bg-card">
                          <CardHeader className="p-3 pb-2">
                            <CardTitle className="text-xs tracking-wider flex items-center gap-2">
                              <Globe className="w-3.5 h-3.5" />
                              CHANNELS
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-3 pt-0">
                            <ul className="space-y-1">
                              {Array.isArray(cvProfile.recommended_channels) && cvProfile.recommended_channels.map((ch, i) => (
                                <li key={i} className="text-xs flex items-center gap-1.5">
                                  <ArrowRight className="w-3 h-3 text-primary" />
                                  {ch}
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>

                        <Card className="border-border bg-card">
                          <CardHeader className="p-3 pb-2">
                            <CardTitle className="text-xs tracking-wider">SALARY POSITIONING</CardTitle>
                          </CardHeader>
                          <CardContent className="p-3 pt-0">
                            <div className="text-sm phosphor-glow font-semibold">{cvProfile.salary_positioning ?? '--'}</div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Gaps + Fixes */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card className="border-border bg-card border-red-900">
                          <CardHeader className="p-3 pb-2">
                            <CardTitle className="text-xs tracking-wider text-red-500 flex items-center gap-2">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              CV GAPS
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-3 pt-0">
                            <ul className="space-y-1">
                              {Array.isArray(cvProfile.cv_gaps) && cvProfile.cv_gaps.map((gap, i) => (
                                <li key={i} className="text-xs flex items-start gap-1.5 text-red-400">
                                  <X className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                  {gap}
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>

                        <Card className="border-border bg-card border-green-900">
                          <CardHeader className="p-3 pb-2">
                            <CardTitle className="text-xs tracking-wider flex items-center gap-2">
                              <Check className="w-3.5 h-3.5" />
                              QUICK FIXES
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-3 pt-0">
                            <ul className="space-y-1">
                              {Array.isArray(cvProfile.quick_fixes) && cvProfile.quick_fixes.map((fix, i) => (
                                <li key={i} className="text-xs flex items-start gap-1.5">
                                  <Check className="w-3 h-3 mt-0.5 text-primary flex-shrink-0" />
                                  {fix}
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 3: APPLICATION ARCHIVE */}
          {/* ============================================================ */}
          {activeTab === 'archive' && (
            <div className="space-y-4">
              {/* Stats Bar */}
              <div className="grid grid-cols-3 gap-2">
                <MetricCard label="Total Applications" value={applications.length} icon={<FileText className="w-3.5 h-3.5" />} />
                <MetricCard label="Outreach Sent" value={outreachTargets.length} icon={<Mail className="w-3.5 h-3.5" />} />
                <MetricCard label="Interviews" value={interviews.length} icon={<Calendar className="w-3.5 h-3.5" />} />
              </div>

              {/* Filter */}
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={archiveSearch}
                    onChange={(e) => setArchiveSearch(e.target.value)}
                    placeholder="Search by company or role..."
                    className="pl-8 font-mono text-xs bg-input border-border"
                  />
                </div>
              </div>

              {/* Application Table */}
              <Card className="border-border bg-card">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-xs tracking-wider flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" />
                    APPLICATIONS
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  {filteredApplications.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-6">
                      No applications yet. Run the coordinator or enable Sample Data.
                    </div>
                  )}
                  <div className="space-y-1">
                    {filteredApplications.map((app, idx) => (
                      <div key={idx} className="border border-border">
                        <button
                          className="w-full flex items-center gap-3 p-2 text-xs hover:bg-secondary transition-colors text-left"
                          onClick={() => setExpandedApp(expandedApp === idx ? null : idx)}
                        >
                          {expandedApp === idx ? <ChevronDown className="w-3 h-3 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 flex-shrink-0" />}
                          <span className="font-semibold w-24 truncate">{app.company ?? '--'}</span>
                          <span className="flex-1 truncate text-muted-foreground">{app.job_title ?? '--'}</span>
                          <Badge variant="outline" className="text-xs font-mono">Applied</Badge>
                        </button>
                        {expandedApp === idx && (
                          <div className="p-3 border-t border-border bg-secondary space-y-3">
                            {app.cover_letter && (
                              <div>
                                <div className="text-xs text-muted-foreground tracking-wider mb-1">COVER LETTER:</div>
                                <div className="text-xs">{renderMarkdown(app.cover_letter)}</div>
                              </div>
                            )}
                            {app.application_message && (
                              <div>
                                <div className="text-xs text-muted-foreground tracking-wider mb-1">APPLICATION MESSAGE:</div>
                                <div className="text-xs">{renderMarkdown(app.application_message)}</div>
                              </div>
                            )}
                            {Array.isArray(app.highlighted_projects) && app.highlighted_projects.length > 0 && (
                              <div>
                                <div className="text-xs text-muted-foreground tracking-wider mb-1">HIGHLIGHTED PROJECTS:</div>
                                <ul className="space-y-0.5">
                                  {app.highlighted_projects.map((p, pi) => (
                                    <li key={pi} className="text-xs flex items-center gap-1">
                                      <ChevronRight className="w-3 h-3 text-primary" />{p}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {Array.isArray(app.key_alignment_points) && app.key_alignment_points.length > 0 && (
                              <div>
                                <div className="text-xs text-muted-foreground tracking-wider mb-1">KEY ALIGNMENT:</div>
                                <div className="flex flex-wrap gap-1">
                                  {app.key_alignment_points.map((k, ki) => (
                                    <Badge key={ki} variant="outline" className="text-xs font-mono">{k}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Interview Schedule */}
              <Card className="border-border bg-card">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-xs tracking-wider flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" />
                    INTERVIEW SCHEDULE
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-3">
                  {/* Existing Interviews */}
                  {interviews.length > 0 && (
                    <div className="space-y-1">
                      {interviews.map((iv, i) => (
                        <div key={i} className="border border-border p-2 text-xs flex flex-wrap items-center gap-2">
                          <StatusDot status={iv.interview_scheduled ? 'success' : 'pending'} />
                          <span className="font-semibold">{iv.company ?? '--'}</span>
                          <span className="text-muted-foreground">{iv.role ?? ''}</span>
                          <Separator orientation="vertical" className="h-3" />
                          <span>{iv.interview_date ?? '--'} {iv.interview_time ?? ''}</span>
                          <Badge variant="outline" className="text-xs font-mono">{iv.interview_format ?? 'TBD'}</Badge>
                          {iv.interviewer && <span className="text-muted-foreground">w/ {iv.interviewer}</span>}
                          {iv.calendar_event_created && <Badge variant="outline" className="text-xs font-mono">CAL</Badge>}
                          {iv.notes && <div className="w-full text-muted-foreground mt-1">{iv.notes}</div>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Schedule New Interview Form */}
                  <div className="border border-border p-3 space-y-2">
                    <div className="text-xs tracking-wider text-muted-foreground mb-2">SCHEDULE NEW INTERVIEW</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs font-mono">Recruiter Email *</Label>
                        <Input
                          type="email"
                          placeholder="recruiter@company.com"
                          value={interviewForm.recruiterEmail}
                          onChange={(e) => setInterviewForm((prev) => ({ ...prev, recruiterEmail: e.target.value }))}
                          className="font-mono text-xs bg-input border-border"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-mono">Availability</Label>
                        <Input
                          placeholder="Weekdays 9am-5pm PT"
                          value={interviewForm.availability}
                          onChange={(e) => setInterviewForm((prev) => ({ ...prev, availability: e.target.value }))}
                          className="font-mono text-xs bg-input border-border"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs font-mono">Thread Context *</Label>
                      <Textarea
                        placeholder="Describe the email thread context (e.g., 'Follow up on Senior Engineer role at Stripe, recruiter wants to schedule technical screen')"
                        value={interviewForm.threadContext}
                        onChange={(e) => setInterviewForm((prev) => ({ ...prev, threadContext: e.target.value }))}
                        rows={3}
                        className="font-mono text-xs bg-input border-border"
                      />
                    </div>
                    <Button
                      onClick={handleScheduleInterview}
                      disabled={interviewLoading || !interviewForm.recruiterEmail || !interviewForm.threadContext}
                      className="w-full font-mono text-xs tracking-wider"
                    >
                      {interviewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Calendar className="w-3.5 h-3.5 mr-2" />}
                      SCHEDULE INTERVIEW
                    </Button>
                    {interviewStatus && (
                      <div className="text-xs text-muted-foreground border border-border p-1.5 bg-secondary">{interviewStatus}</div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Outreach Management */}
              <Card className="border-border bg-card">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-xs tracking-wider flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5" />
                    OUTREACH MANAGEMENT
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-3">
                  {/* Existing Outreach */}
                  {outreachTargets.length > 0 && (
                    <div className="space-y-1">
                      {outreachTargets.map((t, i) => (
                        <div key={i} className="border border-border p-2 text-xs flex items-center gap-2">
                          <StatusDot status={t.email_status?.toLowerCase() === 'sent' ? 'success' : 'pending'} />
                          <span className="font-semibold">{t.name ?? '--'}</span>
                          <span className="text-muted-foreground">{t.company ?? ''}</span>
                          <span className="text-muted-foreground">{t.role ?? ''}</span>
                          <span className="flex-1" />
                          <Badge variant="outline" className="text-xs font-mono">{t.sequence_stage ?? '--'}</Badge>
                          <Badge variant="outline" className="text-xs font-mono">{t.email_status ?? '--'}</Badge>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Send Outreach Form */}
                  <div className="border border-border p-3 space-y-2">
                    <div className="text-xs tracking-wider text-muted-foreground mb-2">SEND OUTREACH</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs font-mono">Recipient Name *</Label>
                        <Input
                          placeholder="Jane Smith"
                          value={outreachForm.recipientName}
                          onChange={(e) => setOutreachForm((prev) => ({ ...prev, recipientName: e.target.value }))}
                          className="font-mono text-xs bg-input border-border"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-mono">Email *</Label>
                        <Input
                          type="email"
                          placeholder="jane@company.com"
                          value={outreachForm.email}
                          onChange={(e) => setOutreachForm((prev) => ({ ...prev, email: e.target.value }))}
                          className="font-mono text-xs bg-input border-border"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-mono">Company</Label>
                        <Input
                          placeholder="Stripe"
                          value={outreachForm.company}
                          onChange={(e) => setOutreachForm((prev) => ({ ...prev, company: e.target.value }))}
                          className="font-mono text-xs bg-input border-border"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-mono">Role</Label>
                        <Input
                          placeholder="Engineering Recruiter"
                          value={outreachForm.role}
                          onChange={(e) => setOutreachForm((prev) => ({ ...prev, role: e.target.value }))}
                          className="font-mono text-xs bg-input border-border"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs font-mono">Context</Label>
                      <Textarea
                        placeholder="Interested in Senior Engineer role, strong match with distributed systems background..."
                        value={outreachForm.context}
                        onChange={(e) => setOutreachForm((prev) => ({ ...prev, context: e.target.value }))}
                        rows={3}
                        className="font-mono text-xs bg-input border-border"
                      />
                    </div>
                    <Button
                      onClick={handleOutreach}
                      disabled={outreachLoading || !outreachForm.email || !outreachForm.recipientName}
                      className="w-full font-mono text-xs tracking-wider"
                    >
                      {outreachLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Send className="w-3.5 h-3.5 mr-2" />}
                      SEND OUTREACH
                    </Button>
                    {outreachStatus && (
                      <div className="text-xs text-muted-foreground border border-border p-1.5 bg-secondary">{outreachStatus}</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* AGENT STATUS FOOTER */}
        <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-card px-4 py-2 z-50">
          <div className="max-w-[1400px] mx-auto flex items-center gap-3 overflow-x-auto terminal-scroll">
            <span className="text-xs text-muted-foreground tracking-wider flex-shrink-0">AGENTS:</span>
            {Object.entries(AGENT_INFO).map(([id, info]) => (
              <div key={id} className="flex items-center gap-1.5 flex-shrink-0">
                <StatusDot status={activeAgentId === id ? 'active' : 'idle'} />
                <span className={`text-xs tracking-wider ${activeAgentId === id ? 'text-foreground phosphor-glow' : 'text-muted-foreground'}`}>
                  {info.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom spacer for fixed footer */}
        <div className="h-10" />
      </div>
    </ErrorBoundary>
  )
}
