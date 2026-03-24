export type MailEvent =
  | 'JOB_CREATED_FOR_APPROVAL'
  | 'JOB_APPROVED'
  | 'JOB_REJECTED'
  | 'JOB_REQUISITION_CLOSED'
  | 'REFERRAL_JOB_OPEN'
  | 'JOB_DELEGATED'
  | 'CANDIDATE_APPLIED'
  | 'CANDIDATE_SHORTLISTED'
  | 'CANDIDATE_REJECTED'
  | 'INTERVIEW_SCHEDULED'
  | 'NEXT_INTERVIEW_SCHEDULED'
  | 'OFFER_SENT'
  | 'OFFER_ACCEPTED'
  | 'OFFER_REJECTED'
  | 'OFFER_ARGUED';

export type MailTemplateData = Record<string, any>;

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function baseEmailHtml(title: string, contentHtml: string): string {
  return (
    `<html><body style="font-family:Arial, sans-serif; background-color:#F0F4FA; margin:0; padding:0;">` +
    `<table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 0;">` +
    `<tr><td align="center">` +
    `<table width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF; border-radius:14px; border:1px solid #E5E7EB; overflow:hidden;">` +
    `<tr><td style="background-color:#0B3D91; padding:22px 24px; color:#FFFFFF; text-align:left;">` +
    `<h2 style="margin:0; font-size:18px; font-weight:700;">${escapeHtml(title)}</h2>` +
    `</td></tr>` +
    `<tr><td style="padding:22px 24px; color:#111827;">` +
    `${contentHtml}` +
    `</td></tr>` +
    `<tr><td style="background-color:#F3F4F6; padding:14px 24px; text-align:center; color:#6B7280; font-size:12px; line-height:1.5;">` +
    `© ${new Date().getFullYear()} Adnate IT Solutions. All rights reserved.<br/>` +
    `This is an automated message. Please do not reply.` +
    `</td></tr>` +
    `</table>` +
    `</td></tr>` +
    `</table>` +
    `</body></html>`
  );
}

function row(label: string, value: unknown): string {
  const v = escapeHtml(value);
  return (
    `<tr>` +
    `<td style="padding:8px 10px; color:#6B7280; font-size:13px; width:45%;">${escapeHtml(label)}</td>` +
    `<td style="padding:8px 10px; color:#111827; font-size:13px; font-weight:600;">${v || '-'}</td>` +
    `</tr>`
  );
}

export function buildMailBody(event: MailEvent, data: MailTemplateData): { subject: string; body: string } {
  switch (event) {
    case 'JOB_CREATED_FOR_APPROVAL': {
      const subject = `Approval requested: ${data['jobTitle'] || 'Job Requisition'}`;
      const contentHtml =
        `<p style="margin:0 0 14px;">Hi,</p>` +
        `<p style="margin:0 0 14px;">A new job requisition has been created and is pending your approval.</p>` +
        `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid #E5E7EB; border-radius:10px;">` +
        row('Requisition ID', data['requisitionId']) +
        row('Job Title', data['jobTitle']) +
        row('Department', data['departmentName']) +
        row('Requested By', data['requestedBy']) +
        `</table>` +
        `<p style="margin:16px 0 0; color:#374151;">Please review in HR/Manager Dashboard and take the required action.</p>`;
      return { subject, body: baseEmailHtml('Job Approval Request', contentHtml) };
    }

    case 'JOB_APPROVED': {
      const subject = `Job approved: ${data['jobTitle'] || 'Job Requisition'}`;
      const contentHtml =
        `<p style="margin:0 0 14px;">Hello,</p>` +
        `<p style="margin:0 0 14px;">Good news! Your job requisition has been <b>approved</b>.</p>` +
        `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid #E5E7EB; border-radius:10px;">` +
        row('Requisition ID', data['requisitionId']) +
        row('Job Title', data['jobTitle']) +
        row('Approved By', data['approvedBy']) +
        `</table>` +
        `<p style="margin:16px 0 0; color:#374151;">HR will proceed to the next steps and the job will be published for candidates.</p>`;
      return { subject, body: baseEmailHtml('Job Approved', contentHtml) };
    }

    case 'JOB_REQUISITION_CLOSED': {
      const subject = `Job requisition closed: ${data['jobTitle'] || 'Job Requisition'}`;
      const contentHtml =
        `<p style="margin:0 0 14px;">Hello,</p>` +
        `<p style="margin:0 0 14px;">The following job requisition has been <b>closed</b> by HR.</p>` +
        `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid #E5E7EB; border-radius:10px;">` +
        row('Requisition ID', data['requisitionId']) +
        row('Job Title', data['jobTitle']) +
        row('Department', data['departmentName']) +
        row('Closure reason', data['closureReason']) +
        row('Details', data['closureComment']) +
        row('Closed By', data['closedBy']) +
        `</table>` +
        `<p style="margin:16px 0 0; color:#374151;">This recruitment cycle is complete for this requisition.</p>`;
      return { subject, body: baseEmailHtml('Job Requisition Closed', contentHtml) };
    }

    case 'REFERRAL_JOB_OPEN': {
      const subject = `Referral opportunity: ${data['jobTitle'] || 'Open position'}`;
      const contentHtml =
        `<p style="margin:0 0 14px;">Hi <b>${escapeHtml(data['recipientName'] || 'Colleague')}</b>,</p>` +
        `<p style="margin:0 0 14px;">A new position has been approved. If you know someone great, please refer them through the employee referral program.</p>` +
        `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid #E5E7EB; border-radius:10px;">` +
        row('Requisition ID', data['requisitionId']) +
        row('Job Title', data['jobTitle']) +
        row('Department', data['departmentName']) +
        `</table>` +
        (data['applyUrl']
          ? `<p style="margin:16px 0 0;"><a href="${escapeHtml(data['applyUrl'])}" style="color:#2563eb; font-weight:700;">View job &amp; referral options</a></p>`
          : '') +
        `<p style="margin:16px 0 0; color:#374151;">Thank you for helping us hire the best talent.</p>`;
      return { subject, body: baseEmailHtml('Employee Referral — New Opening', contentHtml) };
    }

    case 'JOB_REJECTED': {
      const subject = `Job rejected: ${data['jobTitle'] || 'Job Requisition'}`;
      const contentHtml =
        `<p style="margin:0 0 14px;">Hello,</p>` +
        `<p style="margin:0 0 14px;">We regret to inform you that your job requisition has been <b>rejected</b>.</p>` +
        `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid #E5E7EB; border-radius:10px;">` +
        row('Requisition ID', data['requisitionId']) +
        row('Job Title', data['jobTitle']) +
        row('Rejected By', data['rejectedBy']) +
        row('Reason', data['rejectionReason']) +
        `</table>` +
        `<p style="margin:16px 0 0; color:#374151;">Please resubmit after updating the required details.</p>`;
      return { subject, body: baseEmailHtml('Job Rejected', contentHtml) };
    }

    case 'JOB_DELEGATED': {
      const subject = `Approval delegated: ${data['jobTitle'] || 'Job Requisition'}`;
      const contentHtml =
        `<p style="margin:0 0 14px;">Hi,</p>` +
        `<p style="margin:0 0 14px;">A job requisition task has been delegated to you for review.</p>` +
        `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid #E5E7EB; border-radius:10px;">` +
        row('Requisition ID', data['requisitionId']) +
        row('Job Title', data['jobTitle']) +
        row('Delegated By', data['delegatedBy']) +
        `</table>` +
        `<p style="margin:16px 0 0; color:#374151;">Please take the required action in the Manager Dashboard.</p>`;
      return { subject, body: baseEmailHtml('Task Delegated', contentHtml) };
    }

    case 'CANDIDATE_APPLIED': {
      const subject = `Application submitted: ${data['jobTitle'] || 'Job'}`;
      const contentHtml =
        `<p style="margin:0 0 14px;">Dear <b>${escapeHtml(data['candidateName'])}</b>,</p>` +
        `<p style="margin:0 0 14px;">Thanks for applying. We have received your application for the following role:</p>` +
        `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid #E5E7EB; border-radius:10px;">` +
        row('Requisition ID', data['requisitionId']) +
        row('Job Title', data['jobTitle']) +
        row('Applied On', data['appliedOn']) +
        `</table>` +
        `<p style="margin:16px 0 0; color:#374151;">You can track the status from <b>My Applications</b> in the portal.</p>`;
      return { subject, body: baseEmailHtml('Application Received', contentHtml) };
    }

    case 'CANDIDATE_SHORTLISTED': {
      const subject = `Shortlisted: ${data['jobTitle'] || 'Job'}`;
      const contentHtml =
        `<p style="margin:0 0 14px;">Dear <b>${escapeHtml(data['candidateName'])}</b>,</p>` +
        `<p style="margin:0 0 14px;">Congratulations! You have been <b>shortlisted</b> for:</p>` +
        `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid #E5E7EB; border-radius:10px;">` +
        row('Requisition ID', data['requisitionId']) +
        row('Job Title', data['jobTitle']) +
        `</table>` +
        `<p style="margin:16px 0 0; color:#374151;">Next steps will be shared shortly. Please keep an eye on your portal.</p>`;
      return { subject, body: baseEmailHtml('Shortlisted', contentHtml) };
    }

    case 'CANDIDATE_REJECTED': {
      const subject = `Update: ${data['jobTitle'] || 'Job'} application`;
      const contentHtml =
        `<p style="margin:0 0 14px;">Dear <b>${escapeHtml(data['candidateName'])}</b>,</p>` +
        `<p style="margin:0 0 14px;">Thank you for your interest. We regret to inform you that we cannot proceed further with your application for:</p>` +
        `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid #E5E7EB; border-radius:10px;">` +
        row('Requisition ID', data['requisitionId']) +
        row('Job Title', data['jobTitle']) +
        row('Reason', data['rejectionReason']) +
        `</table>` +
        `<p style="margin:16px 0 0; color:#374151;">We appreciate your effort and encourage you to apply for future openings.</p>`;
      return { subject, body: baseEmailHtml('Application Update', contentHtml) };
    }

    case 'INTERVIEW_SCHEDULED':
    case 'NEXT_INTERVIEW_SCHEDULED': {
      const subject = `Interview scheduled: ${data['jobTitle'] || 'Job'}`;
      const whenLine = data['scheduledFor'] ? ` on <b>${escapeHtml(data['scheduledFor'])}</b>` : '';
      const recipientName = data['recipientName'] || data['candidateName'] || 'Candidate';
      const contentHtml =
        `<p style="margin:0 0 14px;">Dear <b>${escapeHtml(recipientName)}</b>,</p>` +
        `<p style="margin:0 0 14px;">Your <b>${escapeHtml(data['interviewType'])}</b> interview has been scheduled${whenLine}.</p>` +
        `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid #E5E7EB; border-radius:10px;">` +
        row('Requisition ID', data['requisitionId']) +
        row('Job Title', data['jobTitle']) +
        row('Interview Round', data['roundNumber']) +
        row('Meeting Link', data['meetingLink']) +
        `</table>` +
        `<p style="margin:16px 0 0; color:#374151;">Please check the portal for interview details and be available on time.</p>`;
      return { subject, body: baseEmailHtml('Interview Scheduled', contentHtml) };
    }

    case 'OFFER_SENT': {
      const subject = `Offer letter available: ${data['jobTitle'] || 'Job'}`;
      const contentHtml =
        `<p style="margin:0 0 14px;">Dear <b>${escapeHtml(data['candidateName'])}</b>,</p>` +
        `<p style="margin:0 0 14px;">We are pleased to share your <b>offer letter</b> for:</p>` +
        `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid #E5E7EB; border-radius:10px;">` +
        row('Job Title', data['jobTitle']) +
        row('Offered Salary', data['offeredSalary']) +
        row('Currency', data['salaryCurrency']) +
        row('Joining Date', data['joiningDate']) +
        row('Offer Expiry', data['expirationDate']) +
        `</table>` +
        `<p style="margin:16px 0 0; color:#374151;">Please review and respond to the offer in the portal.</p>`;
      return { subject, body: baseEmailHtml('Offer Letter Sent', contentHtml) };
    }

    case 'OFFER_ACCEPTED': {
      const subject = `Offer accepted: ${data['jobTitle'] || 'Job'}`;
      const contentHtml =
        `<p style="margin:0 0 14px;">Hello,</p>` +
        `<p style="margin:0 0 14px;">The candidate has <b>accepted</b> the offer for:</p>` +
        `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid #E5E7EB; border-radius:10px;">` +
        row('Candidate', data['candidateName']) +
        row('Job Title', data['jobTitle']) +
        row('Joining Date', data['joiningDate']) +
        `</table>`;
      return { subject, body: baseEmailHtml('Offer Accepted', contentHtml) };
    }

    case 'OFFER_REJECTED': {
      const subject = `Offer rejected: ${data['jobTitle'] || 'Job'}`;
      const contentHtml =
        `<p style="margin:0 0 14px;">Hello,</p>` +
        `<p style="margin:0 0 14px;">The candidate has <b>rejected</b> the offer for:</p>` +
        `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid #E5E7EB; border-radius:10px;">` +
        row('Candidate', data['candidateName']) +
        row('Job Title', data['jobTitle']) +
        row('Rejection Reason', data['rejectionReason']) +
        `</table>`;
      return { subject, body: baseEmailHtml('Offer Rejected', contentHtml) };
    }

    case 'OFFER_ARGUED': {
      const subject = `Offer argued for review: ${data['jobTitle'] || 'Job'}`;
      const contentHtml =
        `<p style="margin:0 0 14px;">Hello,</p>` +
        `<p style="margin:0 0 14px;">The candidate has submitted an <b>offer argument</b> for review.</p>` +
        `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid #E5E7EB; border-radius:10px;">` +
        row('Candidate', data['candidateName']) +
        row('Job Title', data['jobTitle']) +
        `</table>` +
        `<p style="margin:16px 0 0; color:#374151;">HR will review and provide the final outcome.</p>`;
      return { subject, body: baseEmailHtml('Offer Argued', contentHtml) };
    }

    default: {
      const subject = 'Notification';
      const body = baseEmailHtml('Notification', '<p>Mail template not implemented for this event.</p>');
      return { subject, body };
    }
  }
}

