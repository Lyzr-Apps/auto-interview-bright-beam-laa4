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
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Loader2, Search, Send, Upload, FileText, Trash2, Play, Pause,
  RefreshCw, Clock, Calendar, Mail, Zap, Eye, Check,
  X, ChevronRight, AlertTriangle,
  Target, Star, BarChart3,
  Terminal, Briefcase, Bot,
  ArrowUp, ArrowDown, Hash, Bell, Menu, PanelLeftClose,
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

interface ChatMessage {
  id: string
  type: 'system' | 'user' | 'agent' | 'error' | 'file'
  agentId?: string
  agentName?: string
  content: string
  data?: any
  timestamp: string
  formType?: 'outreach' | 'schedule' | 'craft'
}

interface PipelineMetrics {
  jobsFound: number
  applied: number
  emailsSent: number
  interviews: number
  pending: number
}

// ============================================================================
// HELPERS
// ============================================================================

function getTimeStr(): string {
  const now = new Date()
  return now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function getDateStr(): string {
  const now = new Date()
  return now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' })
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-1">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return <h4 key={i} className="font-semibold text-sm mt-2 mb-1 phosphor-glow">{line.slice(4)}</h4>
        if (line.startsWith('## '))
          return <h3 key={i} className="font-semibold text-base mt-2 mb-1 phosphor-glow">{line.slice(3)}</h3>
        if (line.startsWith('# '))
          return <h2 key={i} className="font-bold text-lg mt-3 mb-1 phosphor-glow">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* '))
          return <li key={i} className="ml-4 list-disc text-xs">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line))
          return <li key={i} className="ml-4 list-decimal text-xs">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-xs">{formatInline(line)}</p>
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

// ============================================================================
// SAMPLE DATA FOR CHAT
// ============================================================================

function getSampleMessages(): ChatMessage[] {
  const ts = getTimeStr()
  return [
    { id: 's1', type: 'system', content: 'AutoHire Terminal v2.0 initialized. Type /help for available commands.', timestamp: ts },
    { id: 's2', type: 'user', content: '/upload resume.pdf', timestamp: ts },
    { id: 's3', type: 'file', content: 'resume.pdf uploaded to knowledge base', timestamp: ts, agentName: 'System' },
    { id: 's4', type: 'agent', agentId: AGENT_IDS.cvStrategist, agentName: 'CV Strategist', content: 'CV analysis complete', timestamp: ts, data: {
      type: 'cv',
      target_roles: ['Senior Software Engineer', 'Staff Engineer', 'Engineering Manager'],
      key_strengths: ['10 years distributed systems', 'Led team of 15', 'Open source contributor'],
      differentiators: ['Published research on ML infrastructure', 'Built systems serving 100M users'],
      experience_years: '10',
      top_skills: ['Python', 'Go', 'Kubernetes', 'System Design', 'Team Leadership'],
      strategy_summary: 'Target senior IC and EM roles at Series B+ startups and FAANG. Lead with distributed systems expertise and team leadership experience.',
      recommended_channels: ['LinkedIn Direct Apply', 'Recruiter Outreach', 'AngelList'],
      salary_positioning: '$180K-$250K base for IC, $200K-$280K for EM roles',
      cv_gaps: ['No formal ML certification despite ML experience', 'Career gap in 2022'],
      quick_fixes: ['Add ML certification from Coursera', 'Frame 2022 gap as sabbatical/consulting'],
    }},
    { id: 's5', type: 'user', content: '/hunt', timestamp: ts },
    { id: 's6', type: 'agent', agentId: AGENT_IDS.jobHuntCoordinator, agentName: 'Coordinator', content: 'Daily hunt cycle complete', timestamp: ts, data: {
      type: 'coordinator',
      cycle_date: '2026-02-27',
      jobs_found: 12,
      applications_sent: 5,
      emails_sent: 3,
      pending_approvals: 2,
      high_priority_jobs: [
        { title: 'Senior Software Engineer', company: 'Stripe', match_score: 95, status: 'Applied', action_taken: 'Submitted personalized application' },
        { title: 'Staff Engineer', company: 'Vercel', match_score: 92, status: 'Outreach Sent', action_taken: 'Cold email to hiring manager' },
        { title: 'Backend Lead', company: 'Linear', match_score: 88, status: 'Discovered', action_taken: 'Pending approval' },
      ],
      outreach_summary: 'Sent 3 personalized outreach emails to recruiters at Stripe, Vercel, Linear.',
      daily_summary: 'Productive day: 12 jobs found, 5 applications sent, 3 outreach emails dispatched. 2 items pending your approval.',
      next_actions: ['Follow up with Stripe recruiter', 'Prepare for Figma interview', 'Review Notion response'],
    }},
    { id: 's7', type: 'user', content: '/outreach Jane Smith jane@stripe.com Stripe', timestamp: ts },
    { id: 's8', type: 'agent', agentId: AGENT_IDS.outreachAgent, agentName: 'Outreach', content: 'Email sent successfully', timestamp: ts, data: {
      type: 'outreach',
      emails_sent: 1,
      outreach_targets: [{ name: 'Jane Smith', company: 'Stripe', role: 'Engineering Recruiter', email_subject: 'Re: Senior Engineer Role - Distributed Systems Background', email_status: 'Sent', sequence_stage: 'Intro' }],
      follow_ups_scheduled: 1,
      summary: 'Sent personalized outreach to Jane Smith at Stripe.',
    }},
    { id: 's9', type: 'user', content: '/scout', timestamp: ts },
    { id: 's10', type: 'agent', agentId: AGENT_IDS.jobScout, agentName: 'Job Scout', content: 'Job scan complete', timestamp: ts, data: {
      type: 'scout',
      jobs_found: 12,
      high_priority_count: 5,
      jobs: [
        { title: 'Senior Software Engineer', company: 'Stripe', location: 'Remote', match_score: 95, channel: 'Direct Apply', urgency: 'High - Posted 2 days ago', url: 'https://stripe.com/careers/123', salary_range: '$180K-$250K', posted_date: '2026-02-25' },
        { title: 'Staff Engineer', company: 'Vercel', location: 'SF / Remote', match_score: 92, channel: 'LinkedIn', urgency: 'Medium', url: 'https://vercel.com/careers', salary_range: '$200K-$280K', posted_date: '2026-02-24' },
        { title: 'Backend Lead', company: 'Linear', location: 'Remote', match_score: 88, channel: 'Recruiter', urgency: 'High - Closing soon', url: 'https://linear.app/jobs', salary_range: '$190K-$260K', posted_date: '2026-02-23' },
      ],
      search_summary: 'Found 12 matching jobs across 8 companies. 5 high-priority matches.',
    }},
  ]
}

// ============================================================================
// STATUS DOT
// ============================================================================

function StatusDot({ status }: { status: 'success' | 'error' | 'pending' | 'active' | 'idle' }) {
  const colors: Record<string, string> = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    pending: 'bg-yellow-500',
    active: 'bg-green-500 animate-pulse',
    idle: 'bg-muted-foreground',
  }
  return <span className={`inline-block w-2 h-2 flex-shrink-0 ${colors[status] ?? 'bg-muted-foreground'}`} />
}

// ============================================================================
// CHAT MESSAGE RENDERERS (rich cards for agent responses)
// ============================================================================

function CVStrategyCard({ data }: { data: any }) {
  return (
    <div className="space-y-3 mt-1">
      {/* Target Roles */}
      <div>
        <div className="text-xs text-muted-foreground tracking-wider mb-1">TARGET ROLES</div>
        <div className="flex flex-wrap gap-1">
          {Array.isArray(data?.target_roles) && data.target_roles.map((r: string, i: number) => (
            <Badge key={i} variant="outline" className="font-mono text-xs">{r}</Badge>
          ))}
        </div>
        {data?.experience_years && <div className="text-xs text-muted-foreground mt-1">{data.experience_years} years experience</div>}
      </div>

      {/* Skills */}
      {Array.isArray(data?.top_skills) && data.top_skills.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground tracking-wider mb-1">SKILLS</div>
          <div className="space-y-1">
            {data.top_skills.map((skill: string, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-24 truncate">{skill}</span>
                <div className="flex-1 h-1.5 bg-secondary border border-border">
                  <div className="h-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, 95 - i * 8))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strengths */}
      {Array.isArray(data?.key_strengths) && data.key_strengths.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground tracking-wider mb-1">KEY STRENGTHS</div>
          {data.key_strengths.map((s: string, i: number) => (
            <div key={i} className="text-xs flex items-start gap-1.5 mb-0.5">
              <Check className="w-3 h-3 mt-0.5 text-primary flex-shrink-0" />
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}

      {/* Differentiators */}
      {Array.isArray(data?.differentiators) && data.differentiators.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground tracking-wider mb-1">DIFFERENTIATORS</div>
          {data.differentiators.map((d: string, i: number) => (
            <div key={i} className="text-xs flex items-start gap-1.5 mb-0.5">
              <Star className="w-3 h-3 mt-0.5 text-primary flex-shrink-0" />
              <span>{d}</span>
            </div>
          ))}
        </div>
      )}

      {/* Strategy Summary */}
      {data?.strategy_summary && (
        <div>
          <div className="text-xs text-muted-foreground tracking-wider mb-1">STRATEGY</div>
          <div className="text-xs border-l-2 border-primary pl-2">{renderMarkdown(data.strategy_summary)}</div>
        </div>
      )}

      {/* Channels */}
      {Array.isArray(data?.recommended_channels) && data.recommended_channels.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground tracking-wider mb-1">CHANNELS</div>
          <div className="flex flex-wrap gap-1">
            {data.recommended_channels.map((ch: string, i: number) => (
              <Badge key={i} variant="secondary" className="font-mono text-xs">{ch}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Salary */}
      {data?.salary_positioning && (
        <div>
          <div className="text-xs text-muted-foreground tracking-wider mb-1">SALARY POSITIONING</div>
          <div className="text-sm phosphor-glow font-semibold">{data.salary_positioning}</div>
        </div>
      )}

      {/* Gaps + Fixes */}
      <div className="grid grid-cols-2 gap-2">
        {Array.isArray(data?.cv_gaps) && data.cv_gaps.length > 0 && (
          <div className="border border-red-900 p-2">
            <div className="text-xs text-red-500 tracking-wider mb-1">GAPS</div>
            {data.cv_gaps.map((g: string, i: number) => (
              <div key={i} className="text-xs text-red-400 flex items-start gap-1 mb-0.5">
                <X className="w-3 h-3 mt-0.5 flex-shrink-0" />{g}
              </div>
            ))}
          </div>
        )}
        {Array.isArray(data?.quick_fixes) && data.quick_fixes.length > 0 && (
          <div className="border border-green-900 p-2">
            <div className="text-xs tracking-wider mb-1">FIXES</div>
            {data.quick_fixes.map((f: string, i: number) => (
              <div key={i} className="text-xs flex items-start gap-1 mb-0.5">
                <Check className="w-3 h-3 mt-0.5 text-primary flex-shrink-0" />{f}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CoordinatorCard({ data }: { data: any }) {
  return (
    <div className="space-y-3 mt-1">
      {/* Metrics bar */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'JOBS', value: data?.jobs_found ?? 0 },
          { label: 'APPS', value: data?.applications_sent ?? 0 },
          { label: 'EMAILS', value: data?.emails_sent ?? 0 },
          { label: 'PENDING', value: data?.pending_approvals ?? 0 },
        ].map((m, i) => (
          <div key={i} className="border border-border p-1.5 text-center">
            <div className="text-lg font-bold phosphor-glow">{m.value}</div>
            <div className="text-xs text-muted-foreground tracking-wider">{m.label}</div>
          </div>
        ))}
      </div>

      {/* High Priority Jobs */}
      {Array.isArray(data?.high_priority_jobs) && data.high_priority_jobs.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground tracking-wider mb-1">HIGH PRIORITY JOBS</div>
          <div className="space-y-1">
            {data.high_priority_jobs.map((j: any, i: number) => (
              <div key={i} className="border border-border p-2 flex items-center gap-2 text-xs">
                <div className="font-semibold">{j?.company ?? '--'}</div>
                <div className="text-muted-foreground flex-1 truncate">{j?.title ?? '--'}</div>
                {(j?.match_score ?? 0) > 0 && (
                  <Badge variant="outline" className="font-mono text-xs">{j.match_score}%</Badge>
                )}
                <Badge variant={j?.status?.toLowerCase()?.includes('applied') ? 'default' : 'secondary'} className="font-mono text-xs">{j?.status ?? '--'}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily Summary */}
      {data?.daily_summary && (
        <div>
          <div className="text-xs text-muted-foreground tracking-wider mb-1">DAILY SUMMARY</div>
          <div className="text-xs border-l-2 border-primary pl-2">{renderMarkdown(data.daily_summary)}</div>
        </div>
      )}

      {/* Outreach Summary */}
      {data?.outreach_summary && (
        <div className="text-xs text-muted-foreground">{data.outreach_summary}</div>
      )}

      {/* Next Actions */}
      {Array.isArray(data?.next_actions) && data.next_actions.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground tracking-wider mb-1">NEXT ACTIONS</div>
          {data.next_actions.map((a: string, i: number) => (
            <div key={i} className="text-xs flex items-center gap-1.5 mb-0.5">
              <ChevronRight className="w-3 h-3 text-primary flex-shrink-0" />{a}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function OutreachCard({ data }: { data: any }) {
  return (
    <div className="space-y-2 mt-1">
      <div className="flex items-center gap-3">
        <div className="text-xs"><span className="text-muted-foreground">Emails sent:</span> <span className="phosphor-glow font-bold">{data?.emails_sent ?? 0}</span></div>
        <div className="text-xs"><span className="text-muted-foreground">Follow-ups:</span> <span className="font-bold">{data?.follow_ups_scheduled ?? 0}</span></div>
      </div>
      {Array.isArray(data?.outreach_targets) && data.outreach_targets.map((t: any, i: number) => (
        <div key={i} className="border border-border p-2 text-xs space-y-1">
          <div className="flex items-center gap-2">
            <Mail className="w-3 h-3 text-primary flex-shrink-0" />
            <span className="font-semibold">{t?.name ?? '--'}</span>
            <span className="text-muted-foreground">{t?.company ?? ''}</span>
            <span className="text-muted-foreground">{t?.role ?? ''}</span>
            <span className="flex-1" />
            <Badge variant="outline" className="font-mono text-xs">{t?.sequence_stage ?? '--'}</Badge>
            <Badge variant={t?.email_status === 'Sent' ? 'default' : 'secondary'} className="font-mono text-xs">{t?.email_status ?? '--'}</Badge>
          </div>
          {t?.email_subject && <div className="text-muted-foreground ml-5">Subject: {t.email_subject}</div>}
        </div>
      ))}
      {data?.summary && <div className="text-xs text-muted-foreground">{data.summary}</div>}
    </div>
  )
}

function JobScoutCard({ data }: { data: any }) {
  return (
    <div className="space-y-2 mt-1">
      <div className="flex items-center gap-3">
        <div className="text-xs"><span className="text-muted-foreground">Found:</span> <span className="phosphor-glow font-bold">{data?.jobs_found ?? 0}</span></div>
        <div className="text-xs"><span className="text-muted-foreground">High Priority:</span> <span className="font-bold text-yellow-500">{data?.high_priority_count ?? 0}</span></div>
      </div>
      {Array.isArray(data?.jobs) && data.jobs.map((j: any, i: number) => (
        <div key={i} className="border border-border p-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <Briefcase className="w-3 h-3 text-primary flex-shrink-0" />
            <span className="font-semibold">{j?.company ?? '--'}</span>
            <span className="text-muted-foreground">{j?.title ?? '--'}</span>
            <span className="flex-1" />
            {(j?.match_score ?? 0) > 0 && <Badge variant="outline" className="font-mono text-xs">{j.match_score}%</Badge>}
            {j?.channel && <Badge variant="secondary" className="font-mono text-xs">{j.channel}</Badge>}
          </div>
          <div className="flex items-center gap-3 mt-1 text-muted-foreground flex-wrap">
            {j?.location && <span>{j.location}</span>}
            {j?.salary_range && <span>{j.salary_range}</span>}
            {j?.urgency && <span className="text-yellow-500">{j.urgency}</span>}
          </div>
          {j?.url && (
            <a href={j.url} target="_blank" rel="noopener noreferrer" className="text-primary underline mt-0.5 inline-block">Apply Link</a>
          )}
        </div>
      ))}
      {data?.search_summary && <div className="text-xs text-muted-foreground">{data.search_summary}</div>}
    </div>
  )
}

function InterviewCard({ data }: { data: any }) {
  return (
    <div className="space-y-2 mt-1">
      <div className="border border-border p-2 text-xs space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="w-3 h-3 text-primary flex-shrink-0" />
          <span className="font-semibold">{data?.company ?? '--'}</span>
          <span className="text-muted-foreground">{data?.role ?? ''}</span>
          <span className="flex-1" />
          <Badge variant={data?.interview_scheduled ? 'default' : 'secondary'} className="font-mono text-xs">{data?.status ?? (data?.interview_scheduled ? 'SCHEDULED' : 'PROCESSING')}</Badge>
        </div>
        {(data?.interview_date || data?.interview_time) && (
          <div className="ml-5 text-muted-foreground">{data?.interview_date ?? ''} {data?.interview_time ?? ''}</div>
        )}
        {data?.interview_format && <div className="ml-5"><Badge variant="outline" className="font-mono text-xs">{data.interview_format}</Badge></div>}
        {data?.interviewer && <div className="ml-5 text-muted-foreground">Interviewer: {data.interviewer}</div>}
        {data?.calendar_event_created && <div className="ml-5 flex items-center gap-1"><Check className="w-3 h-3 text-primary" /><span>Calendar event created</span></div>}
        {data?.reply_sent && <div className="ml-5 flex items-center gap-1"><Check className="w-3 h-3 text-primary" /><span>Reply sent</span></div>}
        {data?.notes && <div className="ml-5 text-muted-foreground mt-1">{data.notes}</div>}
      </div>
    </div>
  )
}

function ApplicationCrafterCard({ data }: { data: any }) {
  return (
    <div className="space-y-2 mt-1">
      <div className="text-xs"><span className="text-muted-foreground">Total crafted:</span> <span className="phosphor-glow font-bold">{data?.total_crafted ?? 0}</span></div>
      {Array.isArray(data?.applications) && data.applications.map((app: any, i: number) => (
        <div key={i} className="border border-border p-2 text-xs space-y-1">
          <div className="flex items-center gap-2">
            <FileText className="w-3 h-3 text-primary flex-shrink-0" />
            <span className="font-semibold">{app?.company ?? '--'}</span>
            <span className="text-muted-foreground">{app?.job_title ?? '--'}</span>
          </div>
          {app?.cover_letter && (
            <div className="ml-5">
              <div className="text-muted-foreground tracking-wider mb-0.5">COVER LETTER:</div>
              <div className="text-xs max-h-20 overflow-y-auto terminal-scroll">{renderMarkdown(app.cover_letter)}</div>
            </div>
          )}
          {app?.application_message && (
            <div className="ml-5">
              <div className="text-muted-foreground tracking-wider mb-0.5">APP MESSAGE:</div>
              <div className="text-xs">{renderMarkdown(app.application_message)}</div>
            </div>
          )}
          {Array.isArray(app?.highlighted_projects) && app.highlighted_projects.length > 0 && (
            <div className="ml-5 flex flex-wrap gap-1">
              {app.highlighted_projects.map((p: string, pi: number) => (
                <Badge key={pi} variant="secondary" className="font-mono text-xs">{p}</Badge>
              ))}
            </div>
          )}
          {Array.isArray(app?.key_alignment_points) && app.key_alignment_points.length > 0 && (
            <div className="ml-5 flex flex-wrap gap-1">
              {app.key_alignment_points.map((k: string, ki: number) => (
                <Badge key={ki} variant="outline" className="font-mono text-xs">{k}</Badge>
              ))}
            </div>
          )}
        </div>
      ))}
      {data?.summary && <div className="text-xs text-muted-foreground">{data.summary}</div>}
    </div>
  )
}

function TelegramCard({ data }: { data: any }) {
  return (
    <div className="space-y-2 mt-1">
      <div className="border border-border p-2 text-xs space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Bell className="w-3 h-3 text-primary flex-shrink-0" />
          <span className="font-semibold">{data?.message_title ?? 'Notification'}</span>
          {data?.priority && <Badge variant={data.priority === 'high' ? 'destructive' : 'outline'} className="font-mono text-xs">{data.priority}</Badge>}
          {data?.notification_type && <Badge variant="secondary" className="font-mono text-xs">{data.notification_type}</Badge>}
        </div>
        {data?.message_body && <div className="text-xs ml-5">{renderMarkdown(data.message_body)}</div>}
        {data?.action_required && (
          <div className="ml-5 text-yellow-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Action Required</div>
        )}
        {Array.isArray(data?.action_options) && data.action_options.length > 0 && (
          <div className="ml-5 flex flex-wrap gap-1">
            {data.action_options.map((opt: string, i: number) => (
              <Badge key={i} variant="outline" className="font-mono text-xs">{opt}</Badge>
            ))}
          </div>
        )}
        {data?.metrics && (
          <div className="ml-5 flex gap-3 text-muted-foreground mt-1">
            <span>Jobs: {data.metrics.jobs_found ?? 0}</span>
            <span>Apps: {data.metrics.applications_sent ?? 0}</span>
            <span>Responses: {data.metrics.responses_received ?? 0}</span>
            <span>Interviews: {data.metrics.interviews_scheduled ?? 0}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function renderAgentData(agentId: string | undefined, data: any) {
  if (!data) return null
  const cardType = data?.type
  if (cardType === 'cv' || agentId === AGENT_IDS.cvStrategist) return <CVStrategyCard data={data} />
  if (cardType === 'coordinator' || agentId === AGENT_IDS.jobHuntCoordinator) return <CoordinatorCard data={data} />
  if (cardType === 'outreach' || agentId === AGENT_IDS.outreachAgent) return <OutreachCard data={data} />
  if (cardType === 'scout' || agentId === AGENT_IDS.jobScout) return <JobScoutCard data={data} />
  if (cardType === 'interview' || agentId === AGENT_IDS.interviewScheduler) return <InterviewCard data={data} />
  if (cardType === 'application' || agentId === AGENT_IDS.applicationCrafter) return <ApplicationCrafterCard data={data} />
  if (cardType === 'telegram' || agentId === AGENT_IDS.telegramNotifier) return <TelegramCard data={data} />
  // Fallback: render as text
  if (typeof data === 'string') return <div className="text-xs mt-1">{renderMarkdown(data)}</div>
  return <pre className="text-xs mt-1 max-h-40 overflow-y-auto terminal-scroll whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
}

// ============================================================================
// INLINE FORM CARD (rendered inside chat)
// ============================================================================

function InlineOutreachForm({ onSubmit, loading }: { onSubmit: (form: { recipientName: string; email: string; company: string; role: string; context: string }) => void; loading: boolean }) {
  const [form, setForm] = useState({ recipientName: '', email: '', company: '', role: '', context: '' })
  return (
    <div className="border border-border bg-secondary p-3 space-y-2 mt-1 text-xs">
      <div className="text-muted-foreground tracking-wider">OUTREACH DETAILS:</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs font-mono">Recipient *</Label>
          <Input placeholder="Jane Smith" value={form.recipientName} onChange={(e) => setForm(prev => ({ ...prev, recipientName: e.target.value }))} className="font-mono text-xs bg-input border-border h-7" />
        </div>
        <div>
          <Label className="text-xs font-mono">Email *</Label>
          <Input type="email" placeholder="jane@company.com" value={form.email} onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))} className="font-mono text-xs bg-input border-border h-7" />
        </div>
        <div>
          <Label className="text-xs font-mono">Company</Label>
          <Input placeholder="Stripe" value={form.company} onChange={(e) => setForm(prev => ({ ...prev, company: e.target.value }))} className="font-mono text-xs bg-input border-border h-7" />
        </div>
        <div>
          <Label className="text-xs font-mono">Role</Label>
          <Input placeholder="Eng. Recruiter" value={form.role} onChange={(e) => setForm(prev => ({ ...prev, role: e.target.value }))} className="font-mono text-xs bg-input border-border h-7" />
        </div>
      </div>
      <div>
        <Label className="text-xs font-mono">Context</Label>
        <Input placeholder="Interested in Senior Engineer role..." value={form.context} onChange={(e) => setForm(prev => ({ ...prev, context: e.target.value }))} className="font-mono text-xs bg-input border-border h-7" />
      </div>
      <Button size="sm" onClick={() => onSubmit(form)} disabled={loading || !form.recipientName || !form.email} className="font-mono text-xs tracking-wider w-full">
        {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Send className="w-3 h-3 mr-1" />}
        SEND OUTREACH
      </Button>
    </div>
  )
}

function InlineScheduleForm({ onSubmit, loading }: { onSubmit: (form: { recruiterEmail: string; threadContext: string; availability: string }) => void; loading: boolean }) {
  const [form, setForm] = useState({ recruiterEmail: '', threadContext: '', availability: '' })
  return (
    <div className="border border-border bg-secondary p-3 space-y-2 mt-1 text-xs">
      <div className="text-muted-foreground tracking-wider">INTERVIEW SCHEDULING DETAILS:</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs font-mono">Recruiter Email *</Label>
          <Input type="email" placeholder="recruiter@company.com" value={form.recruiterEmail} onChange={(e) => setForm(prev => ({ ...prev, recruiterEmail: e.target.value }))} className="font-mono text-xs bg-input border-border h-7" />
        </div>
        <div>
          <Label className="text-xs font-mono">Availability</Label>
          <Input placeholder="Weekdays 9am-5pm PT" value={form.availability} onChange={(e) => setForm(prev => ({ ...prev, availability: e.target.value }))} className="font-mono text-xs bg-input border-border h-7" />
        </div>
      </div>
      <div>
        <Label className="text-xs font-mono">Thread Context *</Label>
        <Input placeholder="Follow up on Senior Engineer role at Stripe..." value={form.threadContext} onChange={(e) => setForm(prev => ({ ...prev, threadContext: e.target.value }))} className="font-mono text-xs bg-input border-border h-7" />
      </div>
      <Button size="sm" onClick={() => onSubmit(form)} disabled={loading || !form.recruiterEmail || !form.threadContext} className="font-mono text-xs tracking-wider w-full">
        {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Calendar className="w-3 h-3 mr-1" />}
        SCHEDULE INTERVIEW
      </Button>
    </div>
  )
}

function InlineCraftForm({ onSubmit, loading }: { onSubmit: (form: { company: string; role: string }) => void; loading: boolean }) {
  const [form, setForm] = useState({ company: '', role: '' })
  return (
    <div className="border border-border bg-secondary p-3 space-y-2 mt-1 text-xs">
      <div className="text-muted-foreground tracking-wider">APPLICATION CRAFTING DETAILS:</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs font-mono">Company *</Label>
          <Input placeholder="Stripe" value={form.company} onChange={(e) => setForm(prev => ({ ...prev, company: e.target.value }))} className="font-mono text-xs bg-input border-border h-7" />
        </div>
        <div>
          <Label className="text-xs font-mono">Role *</Label>
          <Input placeholder="Senior Software Engineer" value={form.role} onChange={(e) => setForm(prev => ({ ...prev, role: e.target.value }))} className="font-mono text-xs bg-input border-border h-7" />
        </div>
      </div>
      <Button size="sm" onClick={() => onSubmit(form)} disabled={loading || !form.company || !form.role} className="font-mono text-xs tracking-wider w-full">
        {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <FileText className="w-3 h-3 mr-1" />}
        CRAFT APPLICATION
      </Button>
    </div>
  )
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
            <h2 className="text-xl font-semibold mb-2 phosphor-glow">SYSTEM ERROR</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button onClick={() => this.setState({ hasError: false, error: '' })} className="px-4 py-2 bg-primary text-primary-foreground text-sm font-mono">RETRY</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function Page() {
  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [sampleMode, setSampleMode] = useState(false)

  // Command history
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)

  // Time
  const [currentTime, setCurrentTime] = useState('')
  const [currentDate, setCurrentDate] = useState('')

  // Schedule
  const [scheduleId, setScheduleId] = useState(SCHEDULE_ID_INITIAL)
  const [scheduleData, setScheduleData] = useState<Schedule | null>(null)
  const [scheduleLoading, setScheduleLoading] = useState(false)

  // Metrics
  const [pipelineMetrics, setPipelineMetrics] = useState<PipelineMetrics>({ jobsFound: 0, applied: 0, emailsSent: 0, interviews: 0, pending: 0 })

  // KB Docs
  const ragHook = useRAGKnowledgeBase()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Inline form states
  const [showOutreachForm, setShowOutreachForm] = useState(false)
  const [showScheduleForm, setShowScheduleForm] = useState(false)
  const [showCraftForm, setShowCraftForm] = useState(false)

  // Sidebar state (mobile)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ---- Add message helper ----
  const addMsg = useCallback((msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    setMessages(prev => [...prev, { ...msg, id: genId(), timestamp: getTimeStr() }])
  }, [])

  // ---- Schedule Loader ----
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

  // ---- Init Effects ----
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

  const ragFetchRef = useRef(false)
  useEffect(() => {
    if (!ragFetchRef.current) {
      ragFetchRef.current = true
      ragHook.fetchDocuments(RAG_ID)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Welcome message
  const welcomeRef = useRef(false)
  useEffect(() => {
    if (!welcomeRef.current) {
      welcomeRef.current = true
      setMessages([{
        id: genId(),
        type: 'system',
        content: 'AutoHire Terminal v2.0 initialized. Type /help for available commands, or use the quick actions in the sidebar.',
        timestamp: getTimeStr(),
      }])
    }
  }, [])

  // Sample mode toggle
  useEffect(() => {
    if (sampleMode) {
      setMessages(getSampleMessages())
      setPipelineMetrics({ jobsFound: 12, applied: 5, emailsSent: 3, interviews: 1, pending: 2 })
    } else {
      setMessages([{
        id: genId(),
        type: 'system',
        content: 'AutoHire Terminal v2.0 initialized. Type /help for available commands, or use the quick actions in the sidebar.',
        timestamp: getTimeStr(),
      }])
      setPipelineMetrics({ jobsFound: 0, applied: 0, emailsSent: 0, interviews: 0, pending: 0 })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleMode])

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, showOutreachForm, showScheduleForm, showCraftForm])

  // ---- COMMAND PROCESSING ----
  const processCommand = useCallback(async (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return

    // Add user message
    addMsg({ type: 'user', content: trimmed })
    setCommandHistory(prev => [...prev, trimmed])
    setHistoryIdx(-1)

    // Reset inline forms
    setShowOutreachForm(false)
    setShowScheduleForm(false)
    setShowCraftForm(false)

    const lower = trimmed.toLowerCase()
    const parts = trimmed.split(/\s+/)
    const cmd = parts[0]?.toLowerCase()

    // ---- /help ----
    if (cmd === '/help' || cmd === '/start') {
      addMsg({ type: 'system', content: [
        'Available Commands:',
        '',
        '/upload       - Upload CV (PDF, DOCX, TXT)',
        '/analyze      - Re-analyze CV in knowledge base',
        '/hunt         - Run full job hunt cycle (Coordinator)',
        '/scout        - Find matching jobs (Job Scout)',
        '/craft        - Craft application for a specific job',
        '/outreach     - Send recruiter outreach email',
        '/schedule     - Schedule an interview',
        '/notify [msg] - Send Telegram notification',
        '/status       - View schedule & pipeline status',
        '/pause        - Pause daily schedule',
        '/activate     - Activate daily schedule',
        '/run          - Trigger schedule now',
        '/logs         - View execution logs',
        '/help         - Show this help',
        '',
        'Or type any free-text message to talk to the Coordinator.',
      ].join('\n') })
      return
    }

    // ---- /upload ----
    if (cmd === '/upload') {
      fileInputRef.current?.click()
      return
    }

    // ---- /analyze ----
    if (cmd === '/analyze') {
      setIsProcessing(true)
      setActiveAgentId(AGENT_IDS.cvStrategist)
      addMsg({ type: 'system', content: 'Running CV analysis...' })
      const result = await callAIAgent(
        'Analyze the uploaded CV and provide a comprehensive strategy profile including target roles, key strengths, differentiators, top skills, strategy summary, recommended channels, salary positioning, CV gaps, and quick fixes.',
        AGENT_IDS.cvStrategist
      )
      setActiveAgentId(null)
      setIsProcessing(false)
      if (result.success) {
        const data = result?.response?.result
        addMsg({ type: 'agent', agentId: AGENT_IDS.cvStrategist, agentName: 'CV Strategist', content: 'CV analysis complete', data: data ? { ...data, type: 'cv' } : undefined })
      } else {
        addMsg({ type: 'error', content: `CV analysis failed: ${result?.error ?? 'Unknown error'}` })
      }
      return
    }

    // ---- /hunt ----
    if (cmd === '/hunt') {
      setIsProcessing(true)
      setActiveAgentId(AGENT_IDS.jobHuntCoordinator)
      addMsg({ type: 'system', content: 'Launching job hunt cycle... This may take a few minutes.' })
      const result = await callAIAgent('Execute the daily job hunting cycle. Find matching jobs, craft applications for high-priority matches, send outreach emails to recruiters, and provide a comprehensive summary.', AGENT_IDS.jobHuntCoordinator)
      setActiveAgentId(null)
      setIsProcessing(false)
      if (result.success) {
        const data = result?.response?.result
        if (data) {
          setPipelineMetrics(prev => ({
            ...prev,
            jobsFound: data?.jobs_found ?? prev.jobsFound,
            applied: data?.applications_sent ?? prev.applied,
            emailsSent: data?.emails_sent ?? prev.emailsSent,
            pending: data?.pending_approvals ?? prev.pending,
          }))
        }
        addMsg({ type: 'agent', agentId: AGENT_IDS.jobHuntCoordinator, agentName: 'Coordinator', content: 'Hunt cycle complete', data: data ? { ...data, type: 'coordinator' } : undefined })
      } else {
        addMsg({ type: 'error', content: `Hunt cycle failed: ${result?.error ?? 'Unknown error'}` })
      }
      return
    }

    // ---- /scout ----
    if (cmd === '/scout') {
      setIsProcessing(true)
      setActiveAgentId(AGENT_IDS.jobScout)
      addMsg({ type: 'system', content: 'Scanning job boards...' })
      const result = await callAIAgent('Search all job boards and channels for matching positions based on my strategy profile. Return ranked results with match scores.', AGENT_IDS.jobScout)
      setActiveAgentId(null)
      setIsProcessing(false)
      if (result.success) {
        const data = result?.response?.result
        if (data?.jobs_found) {
          setPipelineMetrics(prev => ({ ...prev, jobsFound: data.jobs_found ?? prev.jobsFound }))
        }
        addMsg({ type: 'agent', agentId: AGENT_IDS.jobScout, agentName: 'Job Scout', content: 'Job scan complete', data: data ? { ...data, type: 'scout' } : undefined })
      } else {
        addMsg({ type: 'error', content: `Job scout failed: ${result?.error ?? 'Unknown error'}` })
      }
      return
    }

    // ---- /craft ----
    if (cmd === '/craft') {
      const company = parts[1]
      const role = parts.slice(2).join(' ')
      if (!company || !role) {
        addMsg({ type: 'system', content: 'Enter application details below:' })
        setShowCraftForm(true)
        return
      }
      setIsProcessing(true)
      setActiveAgentId(AGENT_IDS.applicationCrafter)
      addMsg({ type: 'system', content: `Crafting application for ${role} at ${company}...` })
      const result = await callAIAgent(`Craft a personalized application for the ${role} position at ${company}. Include cover letter, application message, highlighted projects, and key alignment points.`, AGENT_IDS.applicationCrafter)
      setActiveAgentId(null)
      setIsProcessing(false)
      if (result.success) {
        const data = result?.response?.result
        addMsg({ type: 'agent', agentId: AGENT_IDS.applicationCrafter, agentName: 'App Crafter', content: 'Application crafted', data: data ? { ...data, type: 'application' } : undefined })
      } else {
        addMsg({ type: 'error', content: `Craft failed: ${result?.error ?? 'Unknown error'}` })
      }
      return
    }

    // ---- /outreach ----
    if (cmd === '/outreach') {
      const name = parts[1]
      const email = parts[2]
      const company = parts.slice(3).join(' ')
      if (!name || !email) {
        addMsg({ type: 'system', content: 'Enter outreach details below:' })
        setShowOutreachForm(true)
        return
      }
      setIsProcessing(true)
      setActiveAgentId(AGENT_IDS.outreachAgent)
      addMsg({ type: 'system', content: `Sending outreach to ${name} (${email})...` })
      const result = await callAIAgent(`Send a personalized cold outreach email to ${name} at ${email}. They work at ${company || 'unknown company'}. Craft a compelling intro email.`, AGENT_IDS.outreachAgent)
      setActiveAgentId(null)
      setIsProcessing(false)
      if (result.success) {
        const data = result?.response?.result
        if (data?.emails_sent) {
          setPipelineMetrics(prev => ({ ...prev, emailsSent: prev.emailsSent + (data.emails_sent ?? 0) }))
        }
        addMsg({ type: 'agent', agentId: AGENT_IDS.outreachAgent, agentName: 'Outreach', content: 'Email sent', data: data ? { ...data, type: 'outreach' } : undefined })
      } else {
        addMsg({ type: 'error', content: `Outreach failed: ${result?.error ?? 'Unknown error'}` })
      }
      return
    }

    // ---- /schedule (interview) ----
    if (cmd === '/schedule') {
      const recruiterEmail = parts[1]
      const context = parts.slice(2).join(' ')
      if (!recruiterEmail || !context) {
        addMsg({ type: 'system', content: 'Enter interview scheduling details below:' })
        setShowScheduleForm(true)
        return
      }
      setIsProcessing(true)
      setActiveAgentId(AGENT_IDS.interviewScheduler)
      addMsg({ type: 'system', content: `Scheduling interview via ${recruiterEmail}...` })
      const result = await callAIAgent(`Check email thread with ${recruiterEmail} regarding: ${context}. Negotiate interview time, confirm the slot, and create a Google Calendar event.`, AGENT_IDS.interviewScheduler)
      setActiveAgentId(null)
      setIsProcessing(false)
      if (result.success) {
        const data = result?.response?.result
        if (data?.interview_scheduled) {
          setPipelineMetrics(prev => ({ ...prev, interviews: prev.interviews + 1 }))
        }
        addMsg({ type: 'agent', agentId: AGENT_IDS.interviewScheduler, agentName: 'Interview Sched.', content: 'Interview processing complete', data: data ? { ...data, type: 'interview' } : undefined })
      } else {
        addMsg({ type: 'error', content: `Interview scheduling failed: ${result?.error ?? 'Unknown error'}` })
      }
      return
    }

    // ---- /notify ----
    if (cmd === '/notify') {
      const notifyMsg = parts.slice(1).join(' ') || 'Status check'
      setIsProcessing(true)
      setActiveAgentId(AGENT_IDS.telegramNotifier)
      addMsg({ type: 'system', content: 'Sending Telegram notification...' })
      const result = await callAIAgent(notifyMsg, AGENT_IDS.telegramNotifier)
      setActiveAgentId(null)
      setIsProcessing(false)
      if (result.success) {
        const data = result?.response?.result
        addMsg({ type: 'agent', agentId: AGENT_IDS.telegramNotifier, agentName: 'Telegram', content: 'Notification sent', data: data ? { ...data, type: 'telegram' } : undefined })
      } else {
        addMsg({ type: 'error', content: `Notification failed: ${result?.error ?? 'Unknown error'}` })
      }
      return
    }

    // ---- /status ----
    if (cmd === '/status') {
      await loadSchedule()
      addMsg({ type: 'system', content: [
        'PIPELINE STATUS:',
        `  Jobs Found:    ${pipelineMetrics.jobsFound}`,
        `  Applied:       ${pipelineMetrics.applied}`,
        `  Emails Sent:   ${pipelineMetrics.emailsSent}`,
        `  Interviews:    ${pipelineMetrics.interviews}`,
        `  Pending:       ${pipelineMetrics.pending}`,
        '',
        'SCHEDULE:',
        `  Status: ${scheduleData?.is_active ? 'ACTIVE' : 'PAUSED'}`,
        `  Cron:   ${scheduleData?.cron_expression ? cronToHuman(scheduleData.cron_expression) : 'N/A'}`,
        `  Next:   ${scheduleData?.next_run_time ? new Date(scheduleData.next_run_time).toLocaleString() : '--'}`,
        `  Last:   ${scheduleData?.last_run_at ? new Date(scheduleData.last_run_at).toLocaleString() : '--'}`,
      ].join('\n') })
      return
    }

    // ---- /pause ----
    if (cmd === '/pause') {
      if (!scheduleId) { addMsg({ type: 'error', content: 'No schedule ID configured' }); return }
      setScheduleLoading(true)
      addMsg({ type: 'system', content: 'Pausing schedule...' })
      const res = await pauseSchedule(scheduleId)
      await loadSchedule()
      setScheduleLoading(false)
      addMsg({ type: 'system', content: res.success ? 'Schedule PAUSED successfully.' : `Failed to pause: ${res.error ?? 'Unknown'}` })
      return
    }

    // ---- /activate ----
    if (cmd === '/activate') {
      if (!scheduleId) { addMsg({ type: 'error', content: 'No schedule ID configured' }); return }
      setScheduleLoading(true)
      addMsg({ type: 'system', content: 'Activating schedule...' })
      const res = await resumeSchedule(scheduleId)
      await loadSchedule()
      setScheduleLoading(false)
      addMsg({ type: 'system', content: res.success ? 'Schedule ACTIVATED successfully.' : `Failed to activate: ${res.error ?? 'Unknown'}` })
      return
    }

    // ---- /run ----
    if (cmd === '/run') {
      if (!scheduleId) { addMsg({ type: 'error', content: 'No schedule ID configured' }); return }
      setScheduleLoading(true)
      addMsg({ type: 'system', content: 'Triggering immediate run...' })
      const res = await triggerScheduleNow(scheduleId)
      setScheduleLoading(false)
      addMsg({ type: 'system', content: res.success ? 'Schedule triggered. Executing now...' : `Failed to trigger: ${res.error ?? 'Unknown'}` })
      return
    }

    // ---- /logs ----
    if (cmd === '/logs') {
      if (!scheduleId) { addMsg({ type: 'error', content: 'No schedule ID configured' }); return }
      setScheduleLoading(true)
      addMsg({ type: 'system', content: 'Fetching execution logs...' })
      const res = await getScheduleLogs(scheduleId, { limit: 10 })
      setScheduleLoading(false)
      if (res.success && Array.isArray(res.executions) && res.executions.length > 0) {
        const logLines = res.executions.map((log: ExecutionLog) => {
          const d = new Date(log.executed_at).toLocaleString()
          const s = log.success ? '[OK]' : '[FAIL]'
          const err = log.error_message ? ` - ${log.error_message}` : ''
          return `  ${s} ${d} (attempt ${log.attempt}/${log.max_attempts})${err}`
        })
        addMsg({ type: 'system', content: `EXECUTION LOGS (${res.total} total):\n${logLines.join('\n')}` })
      } else {
        addMsg({ type: 'system', content: 'No execution logs found.' })
      }
      return
    }

    // ---- Free text -> Coordinator ----
    if (!lower.startsWith('/')) {
      setIsProcessing(true)
      setActiveAgentId(AGENT_IDS.jobHuntCoordinator)
      const result = await callAIAgent(trimmed, AGENT_IDS.jobHuntCoordinator)
      setActiveAgentId(null)
      setIsProcessing(false)
      if (result.success) {
        const data = result?.response?.result
        const text = result?.response?.message ?? data?.daily_summary ?? data?.text ?? ''
        if (data && typeof data === 'object' && Object.keys(data).length > 0) {
          if (data?.jobs_found !== undefined) {
            setPipelineMetrics(prev => ({
              ...prev,
              jobsFound: data?.jobs_found ?? prev.jobsFound,
              applied: data?.applications_sent ?? prev.applied,
              emailsSent: data?.emails_sent ?? prev.emailsSent,
              pending: data?.pending_approvals ?? prev.pending,
            }))
          }
          addMsg({ type: 'agent', agentId: AGENT_IDS.jobHuntCoordinator, agentName: 'Coordinator', content: text || 'Response received', data: { ...data, type: 'coordinator' } })
        } else {
          addMsg({ type: 'agent', agentId: AGENT_IDS.jobHuntCoordinator, agentName: 'Coordinator', content: text || JSON.stringify(data) || 'Command processed' })
        }
      } else {
        addMsg({ type: 'error', content: `Error: ${result?.error ?? 'Unknown error'}` })
      }
      return
    }

    // Unknown command
    addMsg({ type: 'error', content: `Unknown command: ${cmd}. Type /help for available commands.` })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addMsg, scheduleId, scheduleData, pipelineMetrics, loadSchedule])

  // ---- Input handlers ----
  const handleSubmit = () => {
    if (!inputValue.trim() || isProcessing) return
    const val = inputValue
    setInputValue('')
    processCommand(val)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (commandHistory.length > 0) {
        const newIdx = historyIdx < 0 ? commandHistory.length - 1 : Math.max(0, historyIdx - 1)
        setHistoryIdx(newIdx)
        setInputValue(commandHistory[newIdx] ?? '')
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIdx >= 0) {
        const newIdx = historyIdx + 1
        if (newIdx >= commandHistory.length) {
          setHistoryIdx(-1)
          setInputValue('')
        } else {
          setHistoryIdx(newIdx)
          setInputValue(commandHistory[newIdx] ?? '')
        }
      }
    }
  }

  // ---- CV Upload ----
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    addMsg({ type: 'system', content: `Uploading ${file.name} to knowledge base...` })
    setIsProcessing(true)
    const uploadResult = await ragHook.uploadDocument(RAG_ID, file)
    if (uploadResult.success) {
      addMsg({ type: 'file', content: `${file.name} uploaded successfully`, agentName: 'System' })
      addMsg({ type: 'system', content: 'Running CV analysis...' })
      setActiveAgentId(AGENT_IDS.cvStrategist)
      const result = await callAIAgent(
        'Analyze the uploaded CV and provide a comprehensive strategy profile including target roles, key strengths, differentiators, top skills, strategy summary, recommended channels, salary positioning, CV gaps, and quick fixes.',
        AGENT_IDS.cvStrategist
      )
      setActiveAgentId(null)
      if (result.success) {
        const data = result?.response?.result
        addMsg({ type: 'agent', agentId: AGENT_IDS.cvStrategist, agentName: 'CV Strategist', content: 'CV analysis complete', data: data ? { ...data, type: 'cv' } : undefined })
      } else {
        addMsg({ type: 'error', content: `CV analysis failed: ${result?.error ?? 'Unknown error'}` })
      }
    } else {
      addMsg({ type: 'error', content: `Upload failed: ${uploadResult.error ?? 'Unknown error'}` })
    }
    setIsProcessing(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ---- Inline form submissions ----
  const handleOutreachFormSubmit = async (form: { recipientName: string; email: string; company: string; role: string; context: string }) => {
    setShowOutreachForm(false)
    const cmd = `/outreach ${form.recipientName} ${form.email} ${form.company || 'company'}`
    addMsg({ type: 'user', content: cmd })
    setIsProcessing(true)
    setActiveAgentId(AGENT_IDS.outreachAgent)
    addMsg({ type: 'system', content: `Sending outreach to ${form.recipientName} (${form.email})...` })
    const msg = `Send a personalized cold outreach email to ${form.recipientName} at ${form.email}. They work at ${form.company} as ${form.role}. Context: ${form.context}`
    const result = await callAIAgent(msg, AGENT_IDS.outreachAgent)
    setActiveAgentId(null)
    setIsProcessing(false)
    if (result.success) {
      const data = result?.response?.result
      if (data?.emails_sent) {
        setPipelineMetrics(prev => ({ ...prev, emailsSent: prev.emailsSent + (data.emails_sent ?? 0) }))
      }
      addMsg({ type: 'agent', agentId: AGENT_IDS.outreachAgent, agentName: 'Outreach', content: 'Email sent', data: data ? { ...data, type: 'outreach' } : undefined })
    } else {
      addMsg({ type: 'error', content: `Outreach failed: ${result?.error ?? 'Unknown error'}` })
    }
  }

  const handleScheduleFormSubmit = async (form: { recruiterEmail: string; threadContext: string; availability: string }) => {
    setShowScheduleForm(false)
    const cmd = `/schedule ${form.recruiterEmail} ${form.threadContext}`
    addMsg({ type: 'user', content: cmd })
    setIsProcessing(true)
    setActiveAgentId(AGENT_IDS.interviewScheduler)
    addMsg({ type: 'system', content: `Scheduling interview via ${form.recruiterEmail}...` })
    const msg = `Check email thread with ${form.recruiterEmail} regarding: ${form.threadContext}. My availability: ${form.availability || 'Flexible, any weekday 9am-5pm'}. Negotiate interview time, confirm the slot, and create a Google Calendar event.`
    const result = await callAIAgent(msg, AGENT_IDS.interviewScheduler)
    setActiveAgentId(null)
    setIsProcessing(false)
    if (result.success) {
      const data = result?.response?.result
      if (data?.interview_scheduled) {
        setPipelineMetrics(prev => ({ ...prev, interviews: prev.interviews + 1 }))
      }
      addMsg({ type: 'agent', agentId: AGENT_IDS.interviewScheduler, agentName: 'Interview Sched.', content: 'Interview processing complete', data: data ? { ...data, type: 'interview' } : undefined })
    } else {
      addMsg({ type: 'error', content: `Interview scheduling failed: ${result?.error ?? 'Unknown error'}` })
    }
  }

  const handleCraftFormSubmit = async (form: { company: string; role: string }) => {
    setShowCraftForm(false)
    const cmd = `/craft ${form.company} ${form.role}`
    addMsg({ type: 'user', content: cmd })
    setIsProcessing(true)
    setActiveAgentId(AGENT_IDS.applicationCrafter)
    addMsg({ type: 'system', content: `Crafting application for ${form.role} at ${form.company}...` })
    const result = await callAIAgent(`Craft a personalized application for the ${form.role} position at ${form.company}. Include cover letter, application message, highlighted projects, and key alignment points.`, AGENT_IDS.applicationCrafter)
    setActiveAgentId(null)
    setIsProcessing(false)
    if (result.success) {
      const data = result?.response?.result
      addMsg({ type: 'agent', agentId: AGENT_IDS.applicationCrafter, agentName: 'App Crafter', content: 'Application crafted', data: data ? { ...data, type: 'application' } : undefined })
    } else {
      addMsg({ type: 'error', content: `Craft failed: ${result?.error ?? 'Unknown error'}` })
    }
  }

  // ---- Schedule sidebar handlers ----
  const handleToggleSchedule = async () => {
    if (!scheduleId) return
    setScheduleLoading(true)
    if (scheduleData?.is_active) {
      await pauseSchedule(scheduleId)
      addMsg({ type: 'system', content: 'Schedule paused.' })
    } else {
      await resumeSchedule(scheduleId)
      addMsg({ type: 'system', content: 'Schedule activated.' })
    }
    await loadSchedule()
    setScheduleLoading(false)
  }

  const handleRunNow = async () => {
    if (!scheduleId) return
    setScheduleLoading(true)
    const res = await triggerScheduleNow(scheduleId)
    setScheduleLoading(false)
    addMsg({ type: 'system', content: res.success ? 'Schedule triggered. Executing now...' : `Trigger failed: ${res.error ?? 'Unknown'}` })
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <ErrorBoundary>
      <div style={THEME_VARS as React.CSSProperties} className="h-screen bg-background text-foreground font-mono crt-scanlines crt-flicker flex flex-col overflow-hidden">
        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={handleFileUpload} />

        {/* MAIN LAYOUT */}
        <div className="flex flex-1 overflow-hidden">

          {/* ============================================================ */}
          {/* SIDEBAR */}
          {/* ============================================================ */}
          <div className={`${sidebarOpen ? 'w-[280px]' : 'w-0'} flex-shrink-0 border-r border-border bg-card flex flex-col overflow-hidden transition-all duration-200`}>
            <div className="flex flex-col h-full overflow-y-auto terminal-scroll">
              {/* Logo / Header */}
              <div className="p-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-primary" />
                  <h1 className="text-base tracking-wider phosphor-glow-strong font-bold">AUTOHIRE</h1>
                  <span className="terminal-cursor text-foreground" />
                </div>
                <div className="text-xs text-muted-foreground mt-1 tracking-wider">{currentDate} <span className="phosphor-glow">{currentTime}</span></div>
              </div>

              {/* Schedule Status */}
              <div className="p-3 border-b border-border">
                <div className="text-xs text-muted-foreground tracking-wider mb-2">SCHEDULE</div>
                <div className="flex items-center gap-2 mb-2">
                  <StatusDot status={scheduleData?.is_active ? 'active' : 'idle'} />
                  <span className={`text-xs tracking-wider font-semibold ${scheduleData?.is_active ? 'phosphor-glow' : 'text-muted-foreground'}`}>{scheduleData?.is_active ? 'ACTIVE' : 'PAUSED'}</span>
                </div>
                <div className="text-xs text-muted-foreground mb-1">{scheduleData?.cron_expression ? cronToHuman(scheduleData.cron_expression) : 'Loading...'}</div>
                <div className="text-xs text-muted-foreground mb-2">Next: {scheduleData?.next_run_time ? new Date(scheduleData.next_run_time).toLocaleString() : '--'}</div>
                <div className="flex gap-1">
                  <Button size="sm" variant={scheduleData?.is_active ? 'destructive' : 'default'} onClick={handleToggleSchedule} disabled={scheduleLoading} className="text-xs font-mono tracking-wider flex-1 h-7">
                    {scheduleLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : scheduleData?.is_active ? <><Pause className="w-3 h-3 mr-1" />PAUSE</> : <><Play className="w-3 h-3 mr-1" />ACTIVATE</>}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleRunNow} disabled={scheduleLoading} className="text-xs font-mono h-7 px-2">
                    <Zap className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={loadSchedule} disabled={scheduleLoading} className="text-xs font-mono h-7 px-2">
                    <RefreshCw className={`w-3 h-3 ${scheduleLoading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="p-3 border-b border-border">
                <div className="text-xs text-muted-foreground tracking-wider mb-2">QUICK ACTIONS</div>
                <div className="space-y-1">
                  {[
                    { label: 'Upload CV', icon: <Upload className="w-3.5 h-3.5" />, action: () => fileInputRef.current?.click() },
                    { label: 'Run Hunt Cycle', icon: <Target className="w-3.5 h-3.5" />, action: () => processCommand('/hunt') },
                    { label: 'Scout Jobs', icon: <Search className="w-3.5 h-3.5" />, action: () => processCommand('/scout') },
                    { label: 'Craft Application', icon: <FileText className="w-3.5 h-3.5" />, action: () => processCommand('/craft') },
                    { label: 'Send Outreach', icon: <Mail className="w-3.5 h-3.5" />, action: () => processCommand('/outreach') },
                    { label: 'Schedule Interview', icon: <Calendar className="w-3.5 h-3.5" />, action: () => processCommand('/schedule') },
                    { label: 'Check Status', icon: <BarChart3 className="w-3.5 h-3.5" />, action: () => processCommand('/status') },
                    { label: 'View Logs', icon: <Eye className="w-3.5 h-3.5" />, action: () => processCommand('/logs') },
                  ].map((btn, i) => (
                    <Button key={i} variant="outline" size="sm" onClick={btn.action} disabled={isProcessing} className="w-full justify-start text-xs font-mono tracking-wider h-7 px-2">
                      {btn.icon}
                      <span className="ml-2">{btn.label}</span>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Pipeline Metrics */}
              <div className="p-3 border-b border-border">
                <div className="text-xs text-muted-foreground tracking-wider mb-2">PIPELINE</div>
                <div className="space-y-1.5">
                  {[
                    { label: 'Jobs Found', value: pipelineMetrics.jobsFound, icon: <Search className="w-3 h-3" /> },
                    { label: 'Applied', value: pipelineMetrics.applied, icon: <Send className="w-3 h-3" /> },
                    { label: 'Emails Sent', value: pipelineMetrics.emailsSent, icon: <Mail className="w-3 h-3" /> },
                    { label: 'Interviews', value: pipelineMetrics.interviews, icon: <Calendar className="w-3 h-3" /> },
                    { label: 'Pending', value: pipelineMetrics.pending, icon: <Clock className="w-3 h-3" /> },
                  ].map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground">{m.icon}{m.label}</div>
                      <span className="font-bold phosphor-glow">{m.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Agent Status */}
              <div className="p-3 border-b border-border">
                <div className="text-xs text-muted-foreground tracking-wider mb-2">AGENTS</div>
                <div className="space-y-1">
                  {Object.entries(AGENT_INFO).map(([id, info]) => (
                    <div key={id} className="flex items-center gap-2 text-xs group">
                      <StatusDot status={activeAgentId === id ? 'active' : 'idle'} />
                      <span className={`${activeAgentId === id ? 'text-foreground phosphor-glow' : 'text-muted-foreground'} truncate flex-1`}>{info.name}</span>
                      <span className="text-muted-foreground text-xs opacity-0 group-hover:opacity-100 transition-opacity truncate max-w-[100px]">{info.purpose}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* KB Documents */}
              <div className="p-3 flex-1">
                <div className="text-xs text-muted-foreground tracking-wider mb-2 flex items-center justify-between">
                  <span>DOCUMENTS</span>
                  <Button size="sm" variant="ghost" onClick={() => ragHook.fetchDocuments(RAG_ID)} className="h-5 w-5 p-0">
                    <RefreshCw className={`w-3 h-3 ${ragHook.loading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
                {ragHook.loading && <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Loading...</div>}
                {ragHook.error && <div className="text-xs text-red-500">{ragHook.error}</div>}
                {Array.isArray(ragHook.documents) && ragHook.documents.length === 0 && !ragHook.loading && (
                  <div className="text-xs text-muted-foreground text-center py-2">No documents</div>
                )}
                {Array.isArray(ragHook.documents) && ragHook.documents.map((doc, i) => (
                  <div key={i} className="flex items-center justify-between py-0.5 text-xs">
                    <div className="flex items-center gap-1 truncate flex-1">
                      <FileText className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      <span className="truncate">{doc.fileName}</span>
                    </div>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0 flex-shrink-0" onClick={() => ragHook.removeDocuments(RAG_ID, [doc.fileName])}>
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" className="w-full mt-2 text-xs font-mono tracking-wider h-7" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-3 h-3 mr-1" />UPLOAD
                </Button>
              </div>

              {/* Sample Data Toggle */}
              <div className="p-3 border-t border-border">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sampleToggle" className="text-xs text-muted-foreground tracking-wider font-mono cursor-pointer">SAMPLE DATA</Label>
                  <Switch id="sampleToggle" checked={sampleMode} onCheckedChange={setSampleMode} />
                </div>
              </div>
            </div>
          </div>

          {/* ============================================================ */}
          {/* CHAT TERMINAL */}
          {/* ============================================================ */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Chat header bar */}
            <div className="border-b border-border bg-card px-3 py-2 flex items-center gap-2 flex-shrink-0">
              <Button size="sm" variant="ghost" onClick={() => setSidebarOpen(!sidebarOpen)} className="h-7 w-7 p-0">
                {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </Button>
              <Separator orientation="vertical" className="h-4" />
              <Bot className="w-4 h-4 text-primary" />
              <span className="text-xs tracking-wider phosphor-glow font-semibold">AUTOHIRE TERMINAL</span>
              <span className="flex-1" />
              {isProcessing && (
                <div className="flex items-center gap-1.5 text-xs text-primary">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span className="tracking-wider">{activeAgentId ? `${AGENT_INFO[activeAgentId]?.name ?? 'Agent'} processing...` : 'Processing...'}</span>
                </div>
              )}
              <div className="text-xs text-muted-foreground tracking-wider">{currentTime}</div>
            </div>

            {/* Chat messages */}
            <ScrollArea className="flex-1 p-0">
              <div className="p-4 space-y-3">
                {messages.map((msg) => (
                  <div key={msg.id} className="group">
                    {/* System message */}
                    {msg.type === 'system' && (
                      <div className="flex items-start gap-2">
                        <span className="text-xs text-primary font-bold flex-shrink-0 tracking-wider">[SYS]</span>
                        <div className="flex-1 min-w-0">
                          <pre className="text-xs whitespace-pre-wrap break-words">{msg.content}</pre>
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">{msg.timestamp}</span>
                      </div>
                    )}

                    {/* User message */}
                    {msg.type === 'user' && (
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-bold flex-shrink-0 phosphor-glow-strong">&gt;</span>
                        <div className="flex-1 min-w-0 phosphor-glow">
                          <span className="text-xs font-semibold">{msg.content}</span>
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">{msg.timestamp}</span>
                      </div>
                    )}

                    {/* Agent message */}
                    {msg.type === 'agent' && (
                      <div className="flex items-start gap-2">
                        <span className="text-xs text-primary font-bold flex-shrink-0 tracking-wider">[{msg.agentName ?? 'AGENT'}]</span>
                        <div className="flex-1 min-w-0">
                          {msg.content && <div className="text-xs">{msg.content}</div>}
                          {msg.data && (
                            <Card className="border-border bg-secondary mt-1">
                              <CardContent className="p-3">
                                {renderAgentData(msg.agentId, msg.data)}
                              </CardContent>
                            </Card>
                          )}
                          {!msg.data && msg.content && msg.content.length > 50 && (
                            <div className="text-xs mt-1">{renderMarkdown(msg.content)}</div>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">{msg.timestamp}</span>
                      </div>
                    )}

                    {/* Error message */}
                    {msg.type === 'error' && (
                      <div className="flex items-start gap-2">
                        <span className="text-xs text-red-500 font-bold flex-shrink-0 tracking-wider">[ERR]</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs text-red-400">{msg.content}</span>
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">{msg.timestamp}</span>
                      </div>
                    )}

                    {/* File message */}
                    {msg.type === 'file' && (
                      <div className="flex items-start gap-2">
                        <span className="text-xs text-primary font-bold flex-shrink-0 tracking-wider">[FILE]</span>
                        <div className="flex-1 min-w-0 flex items-center gap-1.5">
                          <FileText className="w-3 h-3 text-primary flex-shrink-0" />
                          <span className="text-xs">{msg.content}</span>
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">{msg.timestamp}</span>
                      </div>
                    )}
                  </div>
                ))}

                {/* Typing indicator */}
                {isProcessing && (
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-primary font-bold flex-shrink-0 tracking-wider">[{activeAgentId ? (AGENT_INFO[activeAgentId]?.name ?? 'AGENT') : 'SYS'}]</span>
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-primary animate-pulse" />
                      <span className="w-1.5 h-1.5 bg-primary animate-pulse" style={{ animationDelay: '0.2s' }} />
                      <span className="w-1.5 h-1.5 bg-primary animate-pulse" style={{ animationDelay: '0.4s' }} />
                    </div>
                  </div>
                )}

                {/* Inline Forms */}
                {showOutreachForm && (
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-primary font-bold flex-shrink-0 tracking-wider">[SYS]</span>
                    <div className="flex-1 min-w-0">
                      <InlineOutreachForm onSubmit={handleOutreachFormSubmit} loading={isProcessing} />
                    </div>
                  </div>
                )}
                {showScheduleForm && (
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-primary font-bold flex-shrink-0 tracking-wider">[SYS]</span>
                    <div className="flex-1 min-w-0">
                      <InlineScheduleForm onSubmit={handleScheduleFormSubmit} loading={isProcessing} />
                    </div>
                  </div>
                )}
                {showCraftForm && (
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-primary font-bold flex-shrink-0 tracking-wider">[SYS]</span>
                    <div className="flex-1 min-w-0">
                      <InlineCraftForm onSubmit={handleCraftFormSubmit} loading={isProcessing} />
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>
            </ScrollArea>

            {/* Input bar */}
            <div className="border-t border-border bg-card p-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-foreground text-sm phosphor-glow font-bold flex-shrink-0">&gt;</span>
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a command (/help) or message..."
                  className="flex-1 bg-transparent border-none text-foreground placeholder:text-muted-foreground focus-visible:ring-0 font-mono text-sm h-8"
                  disabled={isProcessing}
                  autoFocus
                />
                <Button onClick={handleSubmit} disabled={isProcessing || !inputValue.trim()} size="sm" className="font-mono text-xs tracking-wider h-8 px-3">
                  {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </Button>
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><ArrowUp className="w-3 h-3" /><ArrowDown className="w-3 h-3" /> History</span>
                <span className="flex items-center gap-1"><Hash className="w-3 h-3" /> /help for commands</span>
                <span className="flex-1" />
                <span>{messages.length} messages</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}
