import {
  Component,
  EventEmitter,
  Output,
  ChangeDetectorRef,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SoapService } from '../../services/soap.service';
import { AiResumeService } from '../../services/ai-resume.service';
import { buildMailBody } from '../../services/mail-templates';
import type { MailEvent } from '../../services/mail-templates';
import { fileToResumeDataUrl } from '../../shared/resume-storage.util';

declare var $: any;

@Component({
  selector: 'app-hr-add-candidate-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './hr-add-candidate-modal.component.html',
  styleUrls: ['./hr-add-candidate-modal.component.scss'],
})
export class HrAddCandidateModalComponent implements OnInit {
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  isLoading = true;
  isSubmitting = false;
  mode: 'resume' | 'manual' = 'resume';

  jobs: { requisition_id: string; title: string; department_name: string }[] = [];
  selectedRequisitionId = '';
  selectedJobTitle = '';

  allSkills: { skill_id: string; skill_name: string }[] = [];
  selectedSkills: { skill_id: string; skill_name: string; experience_years: string }[] = [];
  skillToAdd = '';
  skillExpToAdd = '1';

  firstStageId = '';

  form = {
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    linkedin_url: '',
    experience_years: '',
    location: '',
    summary: '',
    cover_letter: '',
    current_salary: '',
    expected_salary: '',
    notice_period: '',
    highest_qualification: '',
    portfolio_url: '',
    github_url: '',
    willing_to_relocate: false,
    available_joining_date: '',
  };

  manualDegree = '';
  manualInstitution = '';

  educations: Array<{
    degree: string;
    field_of_study: string;
    institution: string;
    start_year: string;
    end_year: string;
    grade: string;
  }> = [];

  experiences: Array<{
    company: string;
    role: string;
    start_date: string;
    end_date: string;
    description: string;
    is_current: boolean;
  }> = [];

  internships: Array<{
    company: string;
    role: string;
    duration: string;
    description: string;
  }> = [];

  projects: Array<{
    title: string;
    description: string;
    technologies: string;
    url: string;
  }> = [];

  certifications: Array<{
    name: string;
    issuing_org: string;
    year: string;
  }> = [];

  resumeFile: File | null = null;
  resumeFileName = '';
  isDragOver = false;
  isParsing = false;
  parseSuccess = false;
  parseError = '';
  resumeDetectedAsResume: boolean | null = null;

  errors: Record<string, string> = {};

  constructor(
    private soap: SoapService,
    private aiResume: AiResumeService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    void this.loadData();
  }

  get availableSkills(): { skill_id: string; skill_name: string }[] {
    const used = new Set(this.selectedSkills.map(s => s.skill_id));
    return this.allSkills.filter(s => !used.has(s.skill_id));
  }

  onJobChange(): void {
    const j = this.jobs.find(x => x.requisition_id === this.selectedRequisitionId);
    this.selectedJobTitle = j?.title || '';
  }

  async loadData(): Promise<void> {
    this.isLoading = true;
    try {
      const [jobsRaw, deptsRaw, skillsRaw, stagesRaw] = await Promise.all([
        this.soap.getJobRequisitions(),
        this.soap.getDepartments(),
        this.soap.getSkills(),
        this.soap.getPipelineStages(),
      ]);

      const deptMap = new Map<string, string>();
      deptsRaw.forEach(d => deptMap.set(d['department_id'] || '', d['department_name'] || ''));

      this.jobs = jobsRaw
        .filter(j => (j['status'] || '').toUpperCase() === 'APPROVED')
        .map(j => ({
          requisition_id: j['requisition_id'] || '',
          title: j['title'] || '',
          department_name: deptMap.get(j['department_id'] || '') || '',
        }));

      this.allSkills = skillsRaw.map(s => ({
        skill_id: s['skill_id'] || '',
        skill_name: s['skill_name'] || '',
      }));

      const sorted = [...stagesRaw].sort(
        (a, b) =>
          parseInt(a['stage_order'] || '0', 10) - parseInt(b['stage_order'] || '0', 10)
      );
      this.firstStageId = sorted[0]?.['stage_id'] || '';

      this.educations = [
        {
          degree: '',
          field_of_study: '',
          institution: '',
          start_year: '',
          end_year: '',
          grade: '',
        },
      ];
      this.experiences = [
        {
          company: '',
          role: '',
          start_date: '',
          end_date: '',
          description: '',
          is_current: false,
        },
      ];
    } catch (e) {
      console.error('[HrAddCandidate] loadData', e);
    } finally {
      this.isLoading = false;
    }
  }

  onOverlay(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) this.close();
  }

  close(): void {
    this.closed.emit();
  }

  onDragOver(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.isDragOver = true;
  }

  onDragLeave(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.isDragOver = false;
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.isDragOver = false;
    if (e.dataTransfer?.files?.length) this.handleFile(e.dataTransfer.files[0]);
  }

  onFileSelect(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) this.handleFile(input.files[0]);
  }

  handleFile(file: File): void {
    const allowed = ['.pdf', '.doc', '.docx'];
    const lower = (file.name || '').toLowerCase();
    if (!allowed.some(ext => lower.endsWith(ext))) {
      this.parseError = 'Please upload PDF or DOC/DOCX.';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.parseError = 'Max 5MB.';
      return;
    }
    this.resumeFile = file;
    this.resumeFileName = file.name;
    this.parseError = '';
    this.parseSuccess = false;
    this.resumeDetectedAsResume = null;
    void this.parseResumeWithAI();
  }

  removeResume(): void {
    this.resumeFile = null;
    this.resumeFileName = '';
    this.parseSuccess = false;
    this.parseError = '';
    this.resumeDetectedAsResume = null;
  }

  async parseResumeWithAI(): Promise<void> {
    if (!this.resumeFile) return;
    this.isParsing = true;
    this.parseError = '';
    this.parseSuccess = false;
    try {
      const parsed = await this.aiResume.parseResume(this.resumeFile);
      if (!this.isLikelyResume(parsed)) {
        this.resumeDetectedAsResume = false;
        this.parseError = 'Document does not look like a resume.';
        return;
      }
      this.resumeDetectedAsResume = true;

      if (parsed.first_name) this.form.first_name = parsed.first_name;
      if (parsed.last_name) this.form.last_name = parsed.last_name;
      if (parsed.email) this.form.email = parsed.email;
      if (parsed.phone) this.form.phone = parsed.phone;
      if (parsed.location) this.form.location = parsed.location;
      if (parsed.linkedin_url) this.form.linkedin_url = parsed.linkedin_url;
      if (parsed.experience_years) this.form.experience_years = parsed.experience_years;
      if (parsed.summary) this.form.summary = parsed.summary;
      if (parsed.current_salary) this.form.current_salary = parsed.current_salary;
      if (parsed.expected_salary) this.form.expected_salary = parsed.expected_salary;
      if (parsed.notice_period) this.form.notice_period = parsed.notice_period;
      if (parsed.highest_qualification) this.form.highest_qualification = parsed.highest_qualification;
      if (parsed.portfolio_url) this.form.portfolio_url = parsed.portfolio_url;
      if (parsed.github_url) this.form.github_url = parsed.github_url;

      if (parsed.education?.length) {
        this.educations = parsed.education.map((e: any) => ({
          degree: e.degree || '',
          field_of_study: e.field_of_study || '',
          institution: e.institution || '',
          start_year: e.start_year || '',
          end_year: e.end_year || '',
          grade: e.grade || '',
        }));
      }
      if (parsed.experience?.length) {
        this.experiences = parsed.experience.map((e: any) => ({
          company: e.company || '',
          role: e.role || '',
          start_date: e.start_date || '',
          end_date: e.end_date || '',
          description: e.description || '',
          is_current: !!e.is_current,
        }));
      }
      if (parsed.internships?.length) {
        this.internships = parsed.internships.map((i: any) => ({
          company: i.company || '',
          role: i.role || '',
          duration: i.duration || '',
          description: i.description || '',
        }));
      }
      if (parsed.projects?.length) {
        this.projects = parsed.projects.map((p: any) => ({
          title: p.title || '',
          description: p.description || '',
          technologies: p.technologies || '',
          url: p.url || '',
        }));
      }
      if (parsed.certifications?.length) {
        this.certifications = parsed.certifications.map((c: any) => ({
          name: c.name || '',
          issuing_org: c.issuing_org || '',
          year: c.year || '',
        }));
      }

      if (parsed.skills?.length) {
        for (const aiSkill of parsed.skills) {
          const match = this.allSkills.find(
            s => s.skill_name.toLowerCase() === (aiSkill.skill_name || '').toLowerCase()
          );
          if (match && !this.selectedSkills.find(s => s.skill_id === match.skill_id)) {
            this.selectedSkills.push({
              skill_id: match.skill_id,
              skill_name: match.skill_name,
              experience_years: aiSkill.experience_years || '1',
            });
          }
        }
      }

      this.parseSuccess = true;
    } catch (err: any) {
      console.error('[HrAddCandidate] parse', err);
      this.parseError = err?.message || 'AI parsing failed.';
    } finally {
      this.isParsing = false;
      this.cdr.detectChanges();
    }
  }

  private isLikelyResume(parsed: any): boolean {
    const email = (parsed?.email || '').trim();
    const phone = (parsed?.phone || '').trim();
    const skillsCount = Array.isArray(parsed?.skills) ? parsed.skills.length : 0;
    const educationCount = Array.isArray(parsed?.education) ? parsed.education.length : 0;
    const experienceCount = Array.isArray(parsed?.experience) ? parsed.experience.length : 0;
    let signals = 0;
    if (email) signals += 2;
    if (phone) signals += 1;
    if (skillsCount > 0) signals += 1;
    if (educationCount > 0) signals += 1;
    if (experienceCount > 0) signals += 1;
    return signals >= 3;
  }

  addSkill(): void {
    if (!this.skillToAdd) return;
    const skill = this.allSkills.find(s => s.skill_id === this.skillToAdd);
    if (skill) {
      this.selectedSkills.push({
        skill_id: skill.skill_id,
        skill_name: skill.skill_name,
        experience_years: this.skillExpToAdd || '1',
      });
      this.skillToAdd = '';
      this.skillExpToAdd = '1';
    }
  }

  removeSkill(i: number): void {
    this.selectedSkills.splice(i, 1);
  }

  private cleanEducations() {
    return this.educations.filter(e => e.degree.trim() || e.institution.trim());
  }

  private cleanExperiences() {
    return this.experiences.filter(e => e.company.trim() || e.role.trim());
  }

  private cleanInternships() {
    return this.internships.filter(i => i.company.trim() || i.role.trim());
  }

  private cleanProjects() {
    return this.projects.filter(p => p.title.trim());
  }

  private cleanCertifications() {
    return this.certifications.filter(c => c.name.trim());
  }

  validate(): boolean {
    this.errors = {};
    if (!this.selectedRequisitionId) this.errors['requisition'] = 'Select a job.';
    if (!this.form.first_name.trim()) this.errors['first_name'] = 'Required';
    if (!this.form.last_name.trim()) this.errors['last_name'] = 'Required';
    if (!this.form.email.trim()) this.errors['email'] = 'Required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email)) this.errors['email'] = 'Invalid email';
    if (!this.form.phone.trim()) this.errors['phone'] = 'Required';
    if (!this.form.experience_years) this.errors['experience_years'] = 'Required';
    if (!this.form.location.trim()) this.errors['location'] = 'Required';

    if (this.mode === 'resume') {
      if (!this.resumeFile) this.errors['resume'] = 'Upload a resume.';
      else if (this.resumeDetectedAsResume === false)
        this.errors['resume'] = 'Please upload a valid resume/CV.';
    }

    if (this.mode === 'manual') {
      const hasManualEdu =
        this.manualDegree.trim() && this.manualInstitution.trim();
      if (!hasManualEdu) {
        this.errors['education'] = 'Enter degree and institution (or switch to resume upload).';
      }
    }

    return Object.keys(this.errors).length === 0;
  }

  async submit(): Promise<void> {
    if (!this.validate()) return;
    if (!this.firstStageId) {
      alert('Pipeline stages not loaded.');
      return;
    }

    this.isSubmitting = true;
    try {
      let candidateId = '';
      const existing = await this.soap.getCandidateByEmail(this.form.email.trim());
      if (existing.length > 0) {
        candidateId = existing[0]['candidate_id'] || '';
      } else {
        let insertResp: any;
        try {
          insertResp = await this.soap.insertCandidate({
            first_name: this.form.first_name.trim(),
            last_name: this.form.last_name.trim(),
            email: this.form.email.trim(),
            phone: this.form.phone.trim(),
            linkedin_url: this.form.linkedin_url.trim(),
            experience_years: this.form.experience_years,
            location: this.form.location.trim(),
          });
        } catch (insertErr: any) {
          const msg = (insertErr?.responseText || insertErr?.message || '').toLowerCase();
          if (msg.includes('duplicate') || msg.includes('already exists')) {
            const found = await this.soap.getCandidateByEmail(this.form.email.trim());
            if (found.length > 0) candidateId = found[0]['candidate_id'] || '';
          } else throw insertErr;
        }

        if (!candidateId && insertResp) {
          try {
            const nodes = $.cordys?.json?.find?.(insertResp, 'candidate_id');
            if (nodes) {
              const node = Array.isArray(nodes) ? nodes[0] : nodes;
              candidateId = typeof node === 'string' ? node : node?.text || '';
            }
          } catch {
            /* ignore */
          }
        }
        if (!candidateId) {
          const found = await this.soap.getCandidateByEmail(this.form.email.trim());
          if (found.length > 0) candidateId = found[0]['candidate_id'] || '';
        }
      }

      if (!candidateId) throw new Error('Could not create or find candidate.');

      const existingApps = await this.soap.getApplicationsByCandidate(candidateId);
      const dup = existingApps.find(a => a['requisition_id'] === this.selectedRequisitionId);
      if (dup) {
        alert('This candidate already has an application for this job.');
        return;
      }

      for (const skill of this.selectedSkills) {
        try {
          await this.soap.insertCandidateSkill(candidateId, skill.skill_id, skill.experience_years);
        } catch {
          /* may exist */
        }
      }

      let eduJson = this.cleanEducations();
      if (this.mode === 'manual' && this.manualDegree.trim() && this.manualInstitution.trim()) {
        eduJson = [
          {
            degree: this.manualDegree.trim(),
            field_of_study: '',
            institution: this.manualInstitution.trim(),
            start_year: '',
            end_year: '',
            grade: '',
          },
        ];
      }
      if (eduJson.length === 0 && this.mode === 'resume' && this.resumeFile) {
        eduJson = [
          {
            degree: 'See resume attachment',
            field_of_study: '',
            institution: 'Parsed / uploaded resume',
            start_year: '',
            end_year: '',
            grade: '',
          },
        ];
      }

      let resumeUrl = '';
      if (this.resumeFile) {
        try {
          const dataUrl = await fileToResumeDataUrl(this.resumeFile);
          resumeUrl = dataUrl || '';
        } catch {
          /* optional */
        }
      }

      const summary =
        this.form.summary.trim() ||
        (this.mode === 'manual' ? 'Profile created by HR (manual entry).' : '');

      await this.soap.insertApplication({
        candidate_id: candidateId,
        requisition_id: this.selectedRequisitionId,
        source: 'HR Portal',
        current_stage_id: this.firstStageId,
        notes: '',
        education_details: JSON.stringify(eduJson),
        experience_details: JSON.stringify(this.cleanExperiences()),
        internship_details: JSON.stringify(this.cleanInternships()),
        project_details: JSON.stringify(this.cleanProjects()),
        certification_details: JSON.stringify(this.cleanCertifications()),
        cover_letter: this.form.cover_letter.trim(),
        summary,
        current_salary: this.form.current_salary.trim(),
        expected_salary: this.form.expected_salary.trim(),
        notice_period: this.form.notice_period,
        total_experience: this.form.experience_years,
        highest_qualification: this.form.highest_qualification.trim(),
        resume_url: resumeUrl,
        portfolio_url: this.form.portfolio_url.trim(),
        github_url: this.form.github_url.trim(),
        linkedin_url: this.form.linkedin_url.trim(),
        willing_to_relocate: this.form.willing_to_relocate ? 'true' : 'false',
        available_joining_date: this.form.available_joining_date,
      });

      try {
        const candidateName =
          `${this.form.first_name} ${this.form.last_name}`.trim() || this.form.email.trim();
        const mail = buildMailBody('CANDIDATE_APPLIED' as MailEvent, {
          candidateName,
          requisitionId: this.selectedRequisitionId,
          jobTitle: this.selectedJobTitle || this.selectedRequisitionId,
          appliedOn: new Date().toISOString(),
        });
        await this.soap.sendAllMailsBPM(this.form.email.trim(), mail.subject, mail.body);
      } catch (mailErr) {
        console.warn('[HrAddCandidate] mail', mailErr);
      }

      this.saved.emit();
      this.close();
    } catch (err: any) {
      console.error('[HrAddCandidate] submit', err);
      alert(err?.message || 'Save failed.');
    } finally {
      this.isSubmitting = false;
    }
  }
}
