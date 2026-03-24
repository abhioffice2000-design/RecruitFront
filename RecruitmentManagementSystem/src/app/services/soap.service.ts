import { Injectable, NgZone } from '@angular/core';
import { HeroService } from '../hero.service';
import { isWeekendUtc, RMS_HR_BUSINESS_CALENDAR_NAME } from '../shared/working-time';
import {
  MOCK_DEPARTMENTS, MOCK_SKILLS, MOCK_USERS, MOCK_JOB_REQUISITIONS, MOCK_APPROVALS, MOCK_JOB_SKILLS, MOCK_PIPELINE_STAGES, MOCK_CANDIDATES, MOCK_CANDIDATE_SKILLS, MOCK_APPLICATIONS,
  MOCK_OFFERS,
  MOCK_DELEGATES
} from './mock-data';

declare var $: any;

/**
 * Shared service that wraps the Cordys jQuery SOAP SDK calls.
 * Every component should use this instead of calling $.cordys.ajax directly.
 */
@Injectable({ providedIn: 'root' })
export class SoapService {

  public useMockData = false;

  private readonly NS = 'http://schemas.cordys.com/RMST1DatabaseMetadata';

  constructor(private ngZone: NgZone, private hero: HeroService) { }

  // ═══════════════════════════════════════════════════════
  //  GENERIC HELPERS
  // ═══════════════════════════════════════════════════════

  /**
   * Execute a Cordys SOAP call and return a Promise.
   * @param method  SOAP method name
   * @param params  Parameters object or XML string
   * @param ns      Namespace (defaults to RMST1DatabaseMetadata)
   * @param attributes Optional attributes for the method element (e.g. {reply: 'yes'})
   */
  call(method: string, params: any, ns?: string, data?: string): Promise<any> {
    return this.hero.ajax(method, ns || this.NS, params, data);
  }

  /**
   * Extract tuples from a Cordys JSON response (dataType: '* json').
   * The response shape is: { tuple: [ { old: { <entity>: { ...fields } } }, ... ] }
   * or a single tuple object if only one row.
   */
  parseTuples(resp: any, entityName?: string): Record<string, string>[] {
    try {
      const tuples = $.cordys.json.find(resp, 'tuple');
      if (!tuples) return [];
      const tupleArr = Array.isArray(tuples) ? tuples : [tuples];
      return tupleArr.map((t: any) => {
        const old = t.old || t;
        // If entityName is provided, pick that sub-object; otherwise flatten
        if (entityName && old[entityName]) {
          return old[entityName];
        }
        // Try to find the first child object (the entity)
        const keys = Object.keys(old);
        for (const key of keys) {
          if (typeof old[key] === 'object' && old[key] !== null) {
            return old[key];
          }
        }
        return old;
      });
    } catch (e) {
      console.warn('[SoapService] parseTuples error:', e);
      return [];
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ═══════════════════════════════════════════════════════
  //  DEPARTMENTS
  // ═══════════════════════════════════════════════════════

  getDepartments(): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve(MOCK_DEPARTMENTS);
    return this.call('GetMt_departmentsObjects', {
      fromDepartment_id: '0', toDepartment_id: 'zzzzzzzzzz'
    }).then(resp => this.parseTuples(resp, 'mt_departments'));
  }

  getDepartmentById(departmentId: string): Promise<Record<string, string> | null> {
    if (this.useMockData) return Promise.resolve(MOCK_DEPARTMENTS.find(d => d.department_id === departmentId) || null);
    return this.call('GetMt_departmentsObject', {
      preserveSpace: 'no',
      qAccess: '0',
      qValues: '',
      Department_id: departmentId
    }).then(resp => {
      const rows = this.parseTuples(resp, 'mt_departments');
      return rows.length > 0 ? rows[0] : null;
    });
  }

  /**
   * Fetch all departments from the database.
   * Uses the GetAllDepartments SOAP method.
   */
  getAllDepartments(): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve(MOCK_DEPARTMENTS);
    return this.call('GetAllDepartments', {}).then(xml => this.parseTuples(xml));
  }

  insertDepartment(data: {
    department_name: string;
    created_by: string;
  }): Promise<any> {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    if (this.useMockData) {
      MOCK_DEPARTMENTS.push({
        department_id: 'D' + String(MOCK_DEPARTMENTS.length + 1).padStart(2, '0'),
        department_name: data.department_name,
        manager_id: ''
      });
      return Promise.resolve({ success: true });
    }
    return this.call('UpdateMt_departments', {
      tuple: {
        'new': {
          mt_departments: {
            '@qAccess': '0',
            '@qConstraint': '0',
            '@qInit': '0',
            '@qValues': '',
            department_name: data.department_name,
            created_at: now,
            created_by: data.created_by,
            updated_at: now,
            updated_by: data.created_by,
            temp1: '', temp2: '', temp3: '', temp4: '', temp5: ''
          }
        }
      }
    }, undefined,);
  }

  // ═══════════════════════════════════════════════════════
  //  SKILLS
  // ═══════════════════════════════════════════════════════

  getSkills(): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve(MOCK_SKILLS);
    return this.call('GetMt_skillsObjects', {
      fromSkill_id: '0', toSkill_id: 'zzzzzzzzzz'
    }).then(resp => this.parseTuples(resp, 'mt_skills'));
  }

  // ═══════════════════════════════════════════════════════
  //  USERS
  // ═══════════════════════════════════════════════════════

  getUsers(): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve(MOCK_USERS);
    return this.call('GetTs_usersObjects', {
      fromUser_id: '0', toUser_id: 'zzzzzzzzzz'
    }).then(resp => this.parseTuples(resp, 'ts_users'));
  }

  /**
   * Internal employees eligible for referral-program emails (excludes candidate-only accounts).
   * Dedupes by email.
   */
  async getInternalUsersForReferralEmails(): Promise<{ email: string; name: string; userId: string }[]> {
    const rows = await this.getUsers();
    const out: { email: string; name: string; userId: string }[] = [];
    const seen = new Set<string>();
    for (const r of rows || []) {
      const role = String(r['role'] || r['Role'] || '').toUpperCase();
      if (role.includes('CANDIDATE')) continue;
      const email = String(r['email'] || r['Email'] || '').trim();
      if (!email || seen.has(email.toLowerCase())) continue;
      const uid = String(r['user_id'] || r['User_id'] || '').trim();
      const fn = String(r['first_name'] || r['First_name'] || '').trim();
      const ln = String(r['last_name'] || r['Last_name'] || '').trim();
      const name = `${fn} ${ln}`.trim() || email;
      seen.add(email.toLowerCase());
      out.push({ email, name, userId: uid });
    }
    return out;
  }

  getAllManagers(): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve(MOCK_USERS.filter((u: any) => u.Role === 'MANAGER' || u.Role === 'LEADERSHIP'));
    return this.call('GetAllManagers', {
      preserveSpace: 'no',
      qAccess: '0',
      qValues: ''
    }).then(xml => this.parseTuples(xml));
  }

  getAllHR(): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve(MOCK_USERS.filter((u: any) => u.Role === 'HR'));
    return this.call('GetAllHR', {
      preserveSpace: 'no',
      qAccess: '0',
      qValues: ''
    }).then(xml => this.parseTuples(xml));
  }

  getAllInterviewers(): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve(MOCK_USERS.filter((u: any) => u.Role === 'INTERVIEWER'));
    return this.call('GetAllInterviewers', {
      preserveSpace: 'no',
      qAccess: '0',
      qValues: ''
    }).then(xml => this.parseTuples(xml));
  }

  getUsersByDepartment(departmentId: string): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve(MOCK_USERS.filter(u => u.Department_id === departmentId));
    return this.call('GetTs_usersObjectsFordepartment_id', {
      Department_id: departmentId
    }).then(resp => this.parseTuples(resp, 'ts_users'));
  }

  getUserById(userId: string): Promise<Record<string, string> | null> {
    if (this.useMockData) return Promise.resolve(MOCK_USERS.find((u: any) => u.User_id === userId) || null);
    return this.call('GetTs_usersObject', {
      User_id: userId
    }).then(resp => {
      const rows = this.parseTuples(resp, 'ts_users');
      return rows.length > 0 ? rows[0] : null;
    });
  }

  insertUser(data: {
    first_name: string;
    last_name: string;
    email: string;
    password_hash: string;
    role: string;
    status: string;
    department_id: string;
    created_by: string;
    temp1?: string;
    temp2?: string;
    temp3?: string;
    temp4?: string;
    temp5?: string;
  }): Promise<any> {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    if (this.useMockData) return Promise.resolve({ success: true });
    return this.call('UpdateTs_users', {
      tuple: {
        'new': {
          ts_users: {
            '@qAccess': '0',
            '@qConstraint': '0',
            '@qInit': '0',
            '@qValues': '',
            first_name: data.first_name,
            last_name: data.last_name,
            email: data.email,
            password_hash: data.password_hash,
            role: data.role,
            status: data.status,
            department_id: data.department_id,
            created_at: now,
            created_by: data.created_by,
            updated_at: now,
            updated_by: data.created_by,
            temp1: data.temp1 || '',
            temp2: data.temp2 || '',
            temp3: data.temp3 || '',
            temp4: data.temp4 || '',
            temp5: data.temp5 || ''
          }
        }
      }
    }).then(resp => {
      const rows = this.parseTuples(resp, 'ts_users');
      return rows.length > 0 ? rows[0] : resp;
    });
  }

  deleteUser(userData: any): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });

    const userId = userData.user_id || userData.User_id || userData.id;
    console.log(`[SoapService] Deleting user ${userId}`);

    return this.call('UpdateTs_users', {
      tuple: {
        'old': {
          ts_users: {
            user_id: userId
          }
        }
      }
    });
  }

  updateUserStatus(userData: any, newStatus: string): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });

    // Use the database ID (user_id) for the update
    const userId = userData.user_id || userData.User_id || userData.id;

    console.log(`[SoapService] Updating status for user ${userId} to ${newStatus}`);

    return this.call('UpdateTs_users', {
      tuple: {
        'old': {
          ts_users: {
            user_id: userId
          }
        },
        'new': {
          ts_users: {
            user_id: userId,
            status: newStatus,
            updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
            updated_by: 'admin'
          }
        }
      }
    });
  }

  updateUser(oldData: any, newData: any): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });

    // Core update logic using the tuple pattern
    // Cordys Update service expects the 'old' element to contain identifying fields (like user_id)
    // and the 'new' element to contain the updated values.

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    return this.call('UpdateTs_users', {
      tuple: {
        'old': {
          ts_users: {
            user_id: oldData.user_id || oldData.User_id
          }
        },
        'new': {
          ts_users: {
            user_id: oldData.user_id || oldData.User_id,
            first_name: newData.first_name,
            last_name: newData.last_name,
            email: newData.email,
            password_hash: newData.password_hash || oldData.password_hash,
            role: newData.role,
            status: newData.status,
            department_id: newData.department_id,
            updated_at: now,
            updated_by: newData.updated_by || 'admin',
            temp1: newData.temp1 || '',
            temp2: newData.temp2 || '',
            temp3: newData.temp3 || '',
            temp4: newData.temp4 || '',
            temp5: newData.temp5 || ''
          }
        }
      }
    });
  }

  updateDepartment(oldData: any, newData: any): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    return this.call('UpdateMt_departments', {
      tuple: {
        'old': {
          mt_departments: {
            department_id: oldData.department_id || oldData.id
          }
        },
        'new': {
          mt_departments: {
            department_id: oldData.department_id || oldData.id,
            department_name: newData.department_name,
            updated_at: now,
            updated_by: newData.updated_by || 'admin',
            temp1: newData.temp1 || '',
            temp2: newData.temp2 || '',
            temp3: newData.temp3 || '',
            temp4: newData.temp4 || '',
            temp5: newData.temp5 || ''
          }
        }
      }
    });
  }

  /**
   * Create a user in the Cordys Organization.
   * Uses the UserManagement namespace.
   */
  createUserInOrganization(data: {
    userName: string;
    description: string;
    password: string;
    role: string;
  }): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });

    // Construct Raw XML string to be 100% accurate to the user's requested SOAP structure
    const soapXml = `<SOAP:Envelope xmlns:SOAP="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP:Body>
    <CreateUserInOrganization xmlns="http://schemas.cordys.com/UserManagement/1.0/Organization">
      <User>
        <UserName isAnonymous="">${data.userName}</UserName>
        <Description>${data.description}</Description>
        <Credentials allowDuplicate="true">
          <UserIDPassword>
            <UserID>${data.userName}</UserID>
            <Password>${data.password}</Password>
          </UserIDPassword>
        </Credentials>
        <Roles>
          <Role application="">${data.role}</Role>
        </Roles>
      </User>
    </CreateUserInOrganization>
  </SOAP:Body>
</SOAP:Envelope>`;

    return this.call('CreateUserInOrganization', {}, 'http://schemas.cordys.com/UserManagement/1.0/Organization', soapXml);
  }

  /**
   * Assign a Cordys role to a user.
   * Uses the UserManagement namespace, not the DB metadata namespace.
   */
  assignRoleToUser(userName: string, roleName: string): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });

    // Construct Raw XML string to be 100% accurate to the user's requested SOAP structure
    const soapXml = `<SOAP:Envelope xmlns:SOAP="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP:Body>
    <AssignRolesToUser xmlns="http://schemas.cordys.com/UserManagement/1.0/Organization">
      <User>
        <UserName>${userName}</UserName>
        <Roles>
          <Role application="">${roleName}</Role>
        </Roles>
      </User>
    </AssignRolesToUser>
  </SOAP:Body>
</SOAP:Envelope>`;

    return this.call('AssignRolesToUser', {}, 'http://schemas.cordys.com/UserManagement/1.0/Organization', soapXml);
  }

  /**
   * Remove a Cordys role from a user.
   * Uses the RemoveRolesFromUser SOAP method.
   */
  removeRoleFromUser(userName: string, roleName: string): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });

    const soapXml = `<SOAP:Envelope xmlns:SOAP="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP:Body>
    <RemoveRolesFromUser xmlns="http://schemas.cordys.com/UserManagement/1.0/Organization">
      <User>
        <UserName>${userName}</UserName>
        <Roles>
          <Role application="">${roleName}</Role>
        </Roles>
      </User>
    </RemoveRolesFromUser>
  </SOAP:Body>
</SOAP:Envelope>`;

    return this.call('RemoveRolesFromUser', {}, 'http://schemas.cordys.com/UserManagement/1.0/Organization', soapXml);
  }

  /**
   * Fetch all roles assigned to a user in Cordys.
   */
  getUserRoles(userName: string): Promise<string[]> {
    if (this.useMockData) return Promise.resolve([]);

    const soapXml = `<SOAP:Envelope xmlns:SOAP="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP:Body>
    <GetRolesForUser xmlns="http://schemas.cordys.com/UserManagement/1.0/Organization">
      <User>
        <UserName>${userName}</UserName>
      </User>
    </GetRolesForUser>
  </SOAP:Body>
</SOAP:Envelope>`;

    return this.call('GetRolesForUser', {}, 'http://schemas.cordys.com/UserManagement/1.0/Organization', soapXml)
      .then(resp => {
        // Search for 'Role' at top level of response payload
        let roles = $.cordys.json.find(resp, 'Role');

        // If not found, look for '<Roles><Role>...</Role></Roles>' structure
        if (!roles) {
          const rolesContainer = $.cordys.json.find(resp, 'Roles');
          if (rolesContainer && rolesContainer.Role) {
            roles = rolesContainer.Role;
          }
        }

        if (!roles) return [];
        const roleArr = Array.isArray(roles) ? roles : [roles];
        return roleArr.map((r: any) => {
          if (typeof r === 'string') return r;
          // Extract the actual role name or DN from several possible fields
          return r['#text'] || r['name'] || r['@name'] || r['Description'] || '';
        }).filter(name => !!name);
      });
  }
  getUserRolesDetail(userName: string): Promise<string[]> {
    if (this.useMockData) return Promise.resolve([]);

    const soapXml = `<SOAP:Envelope xmlns:SOAP="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP:Body>
    <GetUserDetails xmlns="http://schemas.cordys.com/UserManagement/1.0/Organization">
      <User>
        <UserName>${userName}</UserName>
      </User>
    </GetUserDetails>
  </SOAP:Body>
</SOAP:Envelope>`;

    return this.call('GetUserDetails', {}, 'http://schemas.cordys.com/UserManagement/1.0/Organization', soapXml)
      .then(resp => {
        // Search for 'Role' at top level of response payload
        let roles = $.cordys.json.find(resp, 'Role');

        // If not found, look for '<Roles><Role>...</Role></Roles>' structure
        if (!roles) {
          const rolesContainer = $.cordys.json.find(resp, 'Roles');
          if (rolesContainer && rolesContainer.Role) {
            roles = rolesContainer.Role;
          }
        }

        if (!roles) return [];
        const roleArr = Array.isArray(roles) ? roles : [roles];
        return roleArr.map((r: any) => {
          if (typeof r === 'string') return r;
          // Extract the actual role name or DN from several possible fields
          return r['#text'] || r['name'] || r['@name'] || r['Description'] || '';
        }).filter(name => !!name);
      });
  }

  // ═══════════════════════════════════════════════════════
  //  JOB REQUISITIONS
  // ═══════════════════════════════════════════════════════

  getJobRequisitions(): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve(MOCK_JOB_REQUISITIONS);
    return this.call('GetTs_job_requisitionsObjects', {
      fromRequisition_id: '0', toRequisition_id: 'zzzzzzzzzz'
    }).then(resp => this.parseTuples(resp, 'ts_job_requisitions'));
  }

  getJobRequisitionsByCreator(userId: string): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve(MOCK_JOB_REQUISITIONS.filter((j: any) => j.created_by_user === userId));
    return this.call('GetTs_job_requisitionsObjectsForcreated_by_user', {
      Created_by_user: userId
    }).then(resp => this.parseTuples(resp, 'ts_job_requisitions'));
  }

  getJobRequisitionById(requisitionId: string): Promise<Record<string, string> | null> {
    if (this.useMockData) return Promise.resolve(MOCK_JOB_REQUISITIONS.find((j: any) => j.requisition_id === requisitionId) || null);
    return this.call('GetTs_job_requisitionsObject', {
      Requisition_id: requisitionId
    }).then(resp => {
      const rows = this.parseTuples(resp, 'ts_job_requisitions');
      return rows.length > 0 ? rows[0] : null;
    });
  }

  async insertJobRequisition(data: {
    title: string;
    department_id: string;
    description: string;
    experience_min: string;
    experience_max: string;
    salary_min: string;
    salary_max: string;
    salary_currency: string;
    open_positions: string;
    posting_source: string;
    created_by_user: string;
  }): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });

    // Use this.call() for insert — proven to create records successfully
    const resp = await this.call('UpdateTs_job_requisitions', {
      tuple: {
        'new': {
          ts_job_requisitions: {
            title: data.title,
            department_id: data.department_id,
            description: data.description,
            experience_min: data.experience_min,
            experience_max: data.experience_max,
            salary_min: data.salary_min,
            salary_max: data.salary_max,
            salary_currency: data.salary_currency,
            open_positions: data.open_positions,
            status: 'PENDING',
            posting_source: data.posting_source,
            created_by_user: data.created_by_user,
            temp1: '', temp2: '', temp3: '', temp4: '', temp5: ''
          }
        }
      }
    });

    // After insert, query the DB to find the generated requisition_id
    // DB trigger auto-generates the ID, but this.call() doesn't return it
    let reqId = '';
    try {
      const allReqs = await this.getJobRequisitions();
      // Find the most recently created matching record
      const matches = allReqs
        .filter(r =>
          r['title'] === data.title &&
          r['department_id'] === data.department_id &&
          r['created_by_user'] === data.created_by_user
        )
        .sort((a, b) => {
          // Sort by created_at descending to get the latest
          const dateA = a['created_at'] || '';
          const dateB = b['created_at'] || '';
          return dateB.localeCompare(dateA);
        });
      if (matches.length > 0) {
        reqId = matches[0]['requisition_id'] || '';
      }
    } catch (e) {
      console.warn('[SOAP] Failed to query for new requisition ID:', e);
    }

    console.log('[SOAP] Job requisition created, extracted ID:', reqId);
    resp._generatedReqId = reqId;
    return resp;
  }

  updateJobRequisitionStatus(oldData: Record<string, string>, newStatus: string): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });
    return this.call('UpdateTs_job_requisitions', {
      tuple: {
        old: {
          ts_job_requisitions: {
            requisition_id: oldData['requisition_id'],
            title: oldData['title'],
            department_id: oldData['department_id'],
            description: oldData['description'] || '',
            experience_min: oldData['experience_min'] || '',
            experience_max: oldData['experience_max'] || '',
            salary_min: oldData['salary_min'] || '',
            salary_max: oldData['salary_max'] || '',
            salary_currency: oldData['salary_currency'] || '',
            open_positions: oldData['open_positions'] || '',
            status: oldData['status'],
            posting_source: oldData['posting_source'] || '',
            created_by_user: oldData['created_by_user'] || '',
            temp1: oldData['temp1'] || '',
            temp2: oldData['temp2'] || '',
            temp3: oldData['temp3'] || '',
            temp4: oldData['temp4'] || '',
            temp5: oldData['temp5'] || ''
          }
        },
        'new': {
          ts_job_requisitions: {
            requisition_id: oldData['requisition_id'],
            title: oldData['title'],
            department_id: oldData['department_id'],
            description: oldData['description'] || '',
            experience_min: oldData['experience_min'] || '',
            experience_max: oldData['experience_max'] || '',
            salary_min: oldData['salary_min'] || '',
            salary_max: oldData['salary_max'] || '',
            salary_currency: oldData['salary_currency'] || '',
            open_positions: oldData['open_positions'] || '',
            status: newStatus,
            posting_source: oldData['posting_source'] || '',
            created_by_user: oldData['created_by_user'] || '',
            temp1: oldData['temp1'] || '',
            temp2: oldData['temp2'] || '',
            temp3: oldData['temp3'] || '',
            temp4: oldData['temp4'] || '',
            temp5: oldData['temp5'] || ''
          }
        }
      }
    });
  }

  // ═══════════════════════════════════════════════════════
  //  JOB SKILLS
  // ═══════════════════════════════════════════════════════

  insertJobSkill(requisitionId: string, skillId: string, requiredLevel: string): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });
    return this.call('UpdateTs_job_skills', {
      tuple: {
        'new': {
          ts_job_skills: {
            requisition_id: requisitionId,
            skill_id: skillId,
            required_level: requiredLevel,
            temp1: '', temp2: '', temp3: '', temp4: '', temp5: ''
          }
        }
      }
    });
  }

  getJobSkillsByRequisition(requisitionId: string): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve(MOCK_JOB_SKILLS.filter((s: any) => s.requisition_id === requisitionId));
    return this.call('GetTs_job_skillsObjectsForrequisition_id', {
      Requisition_id: requisitionId
    }).then(resp => this.parseTuples(resp, 'ts_job_skills'));
  }

  // ═══════════════════════════════════════════════════════
  //  APPROVALS
  // ═══════════════════════════════════════════════════════

  getApprovals(): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve(MOCK_APPROVALS);
    return this.call('GetTs_approvalsObjects', {
      fromApproval_id: '0', toApproval_id: 'zzzzzzzzzz'
    }).then(resp => this.parseTuples(resp, 'ts_approvals'));
  }

  getApprovalsByRequester(userId: string): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve(MOCK_APPROVALS.filter((a: any) => a.requested_by === userId));
    return this.call('GetTs_approvalsObjectsForrequested_by', {
      Requested_by: userId
    }).then(resp => this.parseTuples(resp, 'ts_approvals'));
  }

  insertApproval(data: {
    entity_type: string;
    entity_id: string;
    requested_by: string;
    comments: string;
  }): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });
    return this.call('UpdateTs_approvals', {
      tuple: {
        'new': {
          ts_approvals: {
            entity_type: data.entity_type,
            entity_id: data.entity_id,
            status: 'PENDING',
            requested_by: data.requested_by,
            comments: data.comments,
            requested_at: new Date().toISOString(),
            temp1: '', temp2: '', temp3: '', temp4: '', temp5: ''
          }
        }
      }
    });
  }

  updateApprovalStatus(oldData: Record<string, string>, newStatus: string, approvedBy: string, comments: string): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });
    return this.call('UpdateTs_approvals', {
      tuple: {
        old: {
          ts_approvals: {
            approval_id: oldData['approval_id'],
            entity_type: oldData['entity_type'],
            entity_id: oldData['entity_id'],
            status: oldData['status'],
            requested_by: oldData['requested_by'],
            approved_by: oldData['approved_by'] || '',
            comments: oldData['comments'] || '',
            requested_at: oldData['requested_at'] || '',
            approved_at: oldData['approved_at'] || '',
            temp1: oldData['temp1'] || '',
            temp2: oldData['temp2'] || '',
            temp3: oldData['temp3'] || '',
            temp4: oldData['temp4'] || '',
            temp5: oldData['temp5'] || ''
          }
        },
        'new': {
          ts_approvals: {
            approval_id: oldData['approval_id'],
            entity_type: oldData['entity_type'],
            entity_id: oldData['entity_id'],
            status: newStatus,
            requested_by: oldData['requested_by'],
            approved_by: approvedBy,
            comments: comments || oldData['comments'] || '',
            requested_at: oldData['requested_at'] || '',
            approved_at: new Date().toISOString(),
            temp1: oldData['temp1'] || '',
            temp2: oldData['temp2'] || '',
            temp3: oldData['temp3'] || '',
            temp4: oldData['temp4'] || '',
            temp5: oldData['temp5'] || ''
          }
        }
      }
    });
  }

  // ═══════════════════════════════════════════════════════
  //  PIPELINE STAGES
  // ═══════════════════════════════════════════════════════

  getPipelineStages(): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve(MOCK_PIPELINE_STAGES);
    return this.call('GetMt_pipeline_stagesObjects', {
      fromStage_id: '0', toStage_id: 'zzzzzzzzzz'
    }).then(resp => this.parseTuples(resp, 'mt_pipeline_stages'));
  }

  // ═══════════════════════════════════════════════════════
  //  CANDIDATES
  // ═══════════════════════════════════════════════════════

  getCandidates(): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve(MOCK_CANDIDATES);
    return this.call('GetTs_candidatesObjects', {
      fromCandidate_id: '0', toCandidate_id: 'zzzzzzzzzz'
    }).then(resp => this.parseTuples(resp, 'ts_candidates'));
  }

  getAllCandidates(): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve(MOCK_CANDIDATES);
    // Use the exact SOAP structure provided by the user
    const soapXml = `<SOAP:Envelope xmlns:SOAP="http://schemas.xmlsoap.org/soap/envelope/">
<SOAP:Body>
<GetAllCandidates xmlns="http://schemas.cordys.com/RMST1DatabaseMetadata" preserveSpace="no" qAccess="0" qValues="" />
</SOAP:Body>
</SOAP:Envelope>`;
    return this.call('GetAllCandidates', {}, 'http://schemas.cordys.com/RMST1DatabaseMetadata', soapXml)
      .then(resp => this.parseTuples(resp, 'ts_candidates'));
  }

  getAllCandidatesCount(): Promise<number> {
    if (this.useMockData) return Promise.resolve(MOCK_CANDIDATES.length);
    const soapXml = `<SOAP:Envelope xmlns:SOAP="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP:Body>
    <GetAllCandidatesCount xmlns="http://schemas.cordys.com/RMST1DatabaseMetadata" preserveSpace="no" qAccess="0" qValues="" />
  </SOAP:Body>
</SOAP:Envelope>`;
    return this.call('GetAllCandidatesCount', {}, 'http://schemas.cordys.com/RMST1DatabaseMetadata', soapXml)
      .then(resp => {
        const rows = this.parseTuples(resp);
        if (rows && rows.length > 0) {
          // Robustly find the count value (checks common Cordys field names)
          const countVal = rows[0]['count'] || rows[0]['COUNT'] || rows[0]['candidate_count'] || '0';
          return parseInt(typeof countVal === 'string' ? countVal : (countVal['#text'] || '0'));
        }
        return 0;
      });
  }

  getAllJobsCount(): Promise<number> {
    if (this.useMockData) return Promise.resolve(MOCK_JOB_REQUISITIONS.length);
    const soapXml = `<SOAP:Envelope xmlns:SOAP="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP:Body>
    <GetAllJobsCount xmlns="http://schemas.cordys.com/RMST1DatabaseMetadata" preserveSpace="no" qAccess="0" qValues="" />
  </SOAP:Body>
</SOAP:Envelope>`;
    return this.call('GetAllJobsCount', {}, 'http://schemas.cordys.com/RMST1DatabaseMetadata', soapXml)
      .then(resp => {
        const rows = this.parseTuples(resp);
        if (rows && rows.length > 0) {
          const countVal = rows[0]['count'] || rows[0]['COUNT'] || rows[0]['job_count'] || '0';
          return parseInt(typeof countVal === 'string' ? countVal : (countVal['#text'] || '0'));
        }
        return 0;
      });
  }

  getAllInterviewsCount(): Promise<number> {
    if (this.useMockData) return Promise.resolve(18); // Default mock value
    const soapXml = `<SOAP:Envelope xmlns:SOAP="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP:Body>
    <GetAllInterviewsCount xmlns="http://schemas.cordys.com/RMST1DatabaseMetadata" preserveSpace="no" qAccess="0" qValues="" />
  </SOAP:Body>
</SOAP:Envelope>`;
    return this.call('GetAllInterviewsCount', {}, 'http://schemas.cordys.com/RMST1DatabaseMetadata', soapXml)
      .then(resp => {
        const rows = this.parseTuples(resp);
        if (rows && rows.length > 0) {
          const countVal = rows[0]['count'] || rows[0]['COUNT'] || rows[0]['interview_count'] || '0';
          return parseInt(typeof countVal === 'string' ? countVal : (countVal['#text'] || '0'));
        }
        return 0;
      });
  }

  getRecentActivities(): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve([]);
    const soapXml = `<SOAP:Envelope xmlns:SOAP="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP:Body>
    <GetRecentActivities xmlns="http://schemas.cordys.com/RMST1DatabaseMetadata" preserveSpace="no" qAccess="0" qValues="" />
  </SOAP:Body>
</SOAP:Envelope>`;
    return this.call('GetRecentActivities', {}, 'http://schemas.cordys.com/RMST1DatabaseMetadata', soapXml)
      .then(resp => this.parseTuples(resp));
  }

  getCandidateById(candidateId: string): Promise<Record<string, string> | null> {
    if (this.useMockData) return Promise.resolve(MOCK_CANDIDATES.find((c: any) => c.candidate_id === candidateId) || null);
    return this.call('GetTs_candidatesObject', {
      Candidate_id: candidateId
    }).then(resp => {
      const rows = this.parseTuples(resp, 'ts_candidates');
      return rows.length > 0 ? rows[0] : null;
    });
  }

  getCandidateByEmail(email: string): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve(MOCK_CANDIDATES.filter((c: any) => c.email === email));
    return this.call('GetTs_candidatesObjectsforemail', {
      Email: email
    }).then(resp => this.parseTuples(resp, 'ts_candidates'));
  }

  insertCandidate(data: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    linkedin_url: string;
    experience_years: string;
    location: string;
  }): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });
    return this.call('UpdateTs_candidates', {
      tuple: {
        'new': {
          ts_candidates: {
            first_name: data.first_name,
            last_name: data.last_name,
            email: data.email,
            phone: data.phone,
            linkedin_url: data.linkedin_url,
            experience_years: data.experience_years,
            location: data.location,
            temp1: '', temp2: '', temp3: '', temp4: '', temp5: ''
          }
        }
      }
    });
  }

  // ═══════════════════════════════════════════════════════
  //  CANDIDATE SKILLS
  // ═══════════════════════════════════════════════════════

  insertCandidateSkill(candidateId: string, skillId: string, experienceYears: string): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });
    return this.call('UpdateTs_candidate_skills', {
      tuple: {
        'new': {
          ts_candidate_skills: {
            candidate_id: candidateId,
            skill_id: skillId,
            experience_years: experienceYears,
            temp1: '', temp2: '', temp3: '', temp4: '', temp5: ''
          }
        }
      }
    });
  }

  getCandidateSkills(candidateId: string): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve(MOCK_CANDIDATE_SKILLS.filter((s: any) => s.candidate_id === candidateId));
    return this.call('GetTs_candidate_skillsObjectsForcandidate_id', {
      Candidate_id: candidateId
    }).then(resp => this.parseTuples(resp, 'ts_candidate_skills'));
  }

  // ═══════════════════════════════════════════════════════
  //  APPLICATIONS
  // ═══════════════════════════════════════════════════════

  getApplications(): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve(MOCK_APPLICATIONS);
    return this.call('GetTs_applicationsObjects', {
      fromApplication_id: '0', toApplication_id: 'zzzzzzzzzz'
    }).then(resp => this.parseTuples(resp, 'ts_applications'));
  }

  getApplicationsByRequisition(requisitionId: string): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve(MOCK_APPLICATIONS.filter((a: any) => a.requisition_id === requisitionId));
    return this.call('GetTs_applicationsObjectsForrequisition_id', {
      Requisition_id: requisitionId
    }).then(resp => this.parseTuples(resp, 'ts_applications'));
  }

  getApplicationsByCandidate(candidateId: string): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve(MOCK_APPLICATIONS.filter((a: any) => a.candidate_id === candidateId));
    return this.call('GetTs_applicationsObjectsForcandidate_id', {
      Candidate_id: candidateId
    }).then(resp => this.parseTuples(resp, 'ts_applications'));
  }

  insertApplication(data: {
    candidate_id: string;
    requisition_id: string;
    source: string;
    current_stage_id: string;
    notes: string;
    // ─── New JSONB fields (stringified JSON arrays) ───
    education_details?: string;
    experience_details?: string;
    internship_details?: string;
    project_details?: string;
    certification_details?: string;
    // ─── New scalar fields ────────────────────────────
    cover_letter?: string;
    summary?: string;
    current_salary?: string;
    expected_salary?: string;
    notice_period?: string;
    total_experience?: string;
    highest_qualification?: string;
    resume_url?: string;
    portfolio_url?: string;
    github_url?: string;
    linkedin_url?: string;
    willing_to_relocate?: string;
    available_joining_date?: string;
  }): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });
    return this.call('UpdateTs_applications', {
      tuple: {
        'new': {
          ts_applications: {
            candidate_id: data.candidate_id,
            requisition_id: data.requisition_id,
            source: data.source,
            // referred_by intentionally omitted — it's an optional FK, must be NULL not ''
            current_stage_id: data.current_stage_id,
            status: 'ACTIVE',
            notes: data.notes,
            applied_at: new Date().toISOString(),
            // ─── JSONB columns (stringified JSON) ────
            education_details: data.education_details || '',
            experience_details: data.experience_details || '',
            internship_details: data.internship_details || '',
            project_details: data.project_details || '',
            certification_details: data.certification_details || '',
            // ─── Scalar columns ──────────────────────
            cover_letter: data.cover_letter || '',
            summary: data.summary || '',
            current_salary: data.current_salary || '',
            expected_salary: data.expected_salary || '',
            notice_period: data.notice_period || '',
            total_experience: data.total_experience || '',
            highest_qualification: data.highest_qualification || '',
            resume_url: data.resume_url || '',
            portfolio_url: data.portfolio_url || '',
            github_url: data.github_url || '',
            linkedin_url: data.linkedin_url || '',
            willing_to_relocate: data.willing_to_relocate || 'false',
            available_joining_date: data.available_joining_date || '',
            temp1: '', temp2: '', temp3: '', temp4: '', temp5: ''
          }
        }
      }
    });
  }


  updateApplicationStage(oldData: Record<string, string>, newStageId: string): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });
    return this.call('UpdateTs_applications', {
      tuple: {
        old: {
          ts_applications: {
            application_id: oldData['application_id'],
            candidate_id: oldData['candidate_id'],
            requisition_id: oldData['requisition_id'],
            source: oldData['source'] || '',
            referred_by: oldData['referred_by'] || '',
            current_stage_id: oldData['current_stage_id'] || '',
            status: oldData['status'],
            notes: oldData['notes'] || '',
            applied_at: oldData['applied_at'] || '',
            created_at: oldData['created_at'] || '',
            created_by: oldData['created_by'] || '',
            updated_at: oldData['updated_at'] || '',
            updated_by: oldData['updated_by'] || '',
            temp1: oldData['temp1'] || '',
            temp2: oldData['temp2'] || '',
            temp3: oldData['temp3'] || '',
            temp4: oldData['temp4'] || '',
            temp5: oldData['temp5'] || '',
            education_details: oldData['education_details'] || '',
            experience_details: oldData['experience_details'] || '',
            internship_details: oldData['internship_details'] || '',
            project_details: oldData['project_details'] || '',
            certification_details: oldData['certification_details'] || '',
            cover_letter: oldData['cover_letter'] || '',
            summary: oldData['summary'] || '',
            current_salary: oldData['current_salary'] || '',
            expected_salary: oldData['expected_salary'] || '',
            notice_period: oldData['notice_period'] || '',
            total_experience: oldData['total_experience'] || '',
            highest_qualification: oldData['highest_qualification'] || '',
            resume_url: oldData['resume_url'] || '',
            portfolio_url: oldData['portfolio_url'] || '',
            github_url: oldData['github_url'] || '',
            linkedin_url: oldData['linkedin_url'] || '',
            willing_to_relocate: oldData['willing_to_relocate'] || '',
            available_joining_date: oldData['available_joining_date'] || ''
          }
        },
        'new': {
          ts_applications: {
            application_id: oldData['application_id'],
            candidate_id: oldData['candidate_id'],
            requisition_id: oldData['requisition_id'],
            source: oldData['source'] || '',
            referred_by: oldData['referred_by'] || '',
            current_stage_id: newStageId,
            status: oldData['status'],
            notes: oldData['notes'] || '',
            applied_at: oldData['applied_at'] || '',
            created_at: oldData['created_at'] || '',
            created_by: oldData['created_by'] || '',
            updated_at: oldData['updated_at'] || '',
            updated_by: oldData['updated_by'] || '',
            temp1: oldData['temp1'] || '',
            temp2: oldData['temp2'] || '',
            temp3: oldData['temp3'] || '',
            temp4: oldData['temp4'] || '',
            temp5: oldData['temp5'] || '',
            education_details: oldData['education_details'] || '',
            experience_details: oldData['experience_details'] || '',
            internship_details: oldData['internship_details'] || '',
            project_details: oldData['project_details'] || '',
            certification_details: oldData['certification_details'] || '',
            cover_letter: oldData['cover_letter'] || '',
            summary: oldData['summary'] || '',
            current_salary: oldData['current_salary'] || '',
            expected_salary: oldData['expected_salary'] || '',
            notice_period: oldData['notice_period'] || '',
            total_experience: oldData['total_experience'] || '',
            highest_qualification: oldData['highest_qualification'] || '',
            resume_url: oldData['resume_url'] || '',
            portfolio_url: oldData['portfolio_url'] || '',
            github_url: oldData['github_url'] || '',
            linkedin_url: oldData['linkedin_url'] || '',
            willing_to_relocate: oldData['willing_to_relocate'] || '',
            available_joining_date: oldData['available_joining_date'] || ''
          }
        }
      }
    });
  }

  /**
   * Update both application `status` and `current_stage_id` in one DB call.
   * Useful for candidate actions like Accept/Reject/Argue where we must keep UI consistent.
   */
  updateApplicationStageAndStatus(
    oldData: Record<string, string>,
    newStatus: string,
    newStageId: string
  ): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });
    return this.call('UpdateTs_applications', {
      tuple: {
        old: {
          ts_applications: {
            application_id: oldData['application_id'],
            candidate_id: oldData['candidate_id'],
            requisition_id: oldData['requisition_id'],
            source: oldData['source'] || '',
            referred_by: oldData['referred_by'] || '',
            current_stage_id: oldData['current_stage_id'] || '',
            status: oldData['status'],
            notes: oldData['notes'] || '',
            applied_at: oldData['applied_at'] || '',
            created_at: oldData['created_at'] || '',
            created_by: oldData['created_by'] || '',
            updated_at: oldData['updated_at'] || '',
            updated_by: oldData['updated_by'] || '',
            temp1: oldData['temp1'] || '',
            temp2: oldData['temp2'] || '',
            temp3: oldData['temp3'] || '',
            temp4: oldData['temp4'] || '',
            temp5: oldData['temp5'] || '',
            education_details: oldData['education_details'] || '',
            experience_details: oldData['experience_details'] || '',
            internship_details: oldData['internship_details'] || '',
            project_details: oldData['project_details'] || '',
            certification_details: oldData['certification_details'] || '',
            cover_letter: oldData['cover_letter'] || '',
            summary: oldData['summary'] || '',
            current_salary: oldData['current_salary'] || '',
            expected_salary: oldData['expected_salary'] || '',
            notice_period: oldData['notice_period'] || '',
            total_experience: oldData['total_experience'] || '',
            highest_qualification: oldData['highest_qualification'] || '',
            resume_url: oldData['resume_url'] || '',
            portfolio_url: oldData['portfolio_url'] || '',
            github_url: oldData['github_url'] || '',
            linkedin_url: oldData['linkedin_url'] || '',
            willing_to_relocate: oldData['willing_to_relocate'] || '',
            available_joining_date: oldData['available_joining_date'] || ''
          }
        },
        'new': {
          ts_applications: {
            application_id: oldData['application_id'],
            candidate_id: oldData['candidate_id'],
            requisition_id: oldData['requisition_id'],
            source: oldData['source'] || '',
            referred_by: oldData['referred_by'] || '',
            current_stage_id: newStageId,
            status: newStatus,
            notes: oldData['notes'] || '',
            applied_at: oldData['applied_at'] || '',
            created_at: oldData['created_at'] || '',
            created_by: oldData['created_by'] || '',
            updated_at: oldData['updated_at'] || '',
            updated_by: oldData['updated_by'] || '',
            temp1: oldData['temp1'] || '',
            temp2: oldData['temp2'] || '',
            temp3: oldData['temp3'] || '',
            temp4: oldData['temp4'] || '',
            temp5: oldData['temp5'] || '',
            education_details: oldData['education_details'] || '',
            experience_details: oldData['experience_details'] || '',
            internship_details: oldData['internship_details'] || '',
            project_details: oldData['project_details'] || '',
            certification_details: oldData['certification_details'] || '',
            cover_letter: oldData['cover_letter'] || '',
            summary: oldData['summary'] || '',
            current_salary: oldData['current_salary'] || '',
            expected_salary: oldData['expected_salary'] || '',
            notice_period: oldData['notice_period'] || '',
            total_experience: oldData['total_experience'] || '',
            highest_qualification: oldData['highest_qualification'] || '',
            resume_url: oldData['resume_url'] || '',
            portfolio_url: oldData['portfolio_url'] || '',
            github_url: oldData['github_url'] || '',
            linkedin_url: oldData['linkedin_url'] || '',
            willing_to_relocate: oldData['willing_to_relocate'] || '',
            available_joining_date: oldData['available_joining_date'] || ''
          }
        }
      }
    });
  }

  updateApplicationStatus(oldData: Record<string, string>, newStatus: string): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });
    return this.call('UpdateTs_applications', {
      tuple: {
        old: {
          ts_applications: {
            application_id: oldData['application_id'],
            candidate_id: oldData['candidate_id'],
            requisition_id: oldData['requisition_id'],
            source: oldData['source'] || '',
            referred_by: oldData['referred_by'] || '',
            current_stage_id: oldData['current_stage_id'] || '',
            status: oldData['status'],
            notes: oldData['notes'] || '',
            applied_at: oldData['applied_at'] || '',
            created_at: oldData['created_at'] || '',
            created_by: oldData['created_by'] || '',
            updated_at: oldData['updated_at'] || '',
            updated_by: oldData['updated_by'] || '',
            temp1: oldData['temp1'] || '',
            temp2: oldData['temp2'] || '',
            temp3: oldData['temp3'] || '',
            temp4: oldData['temp4'] || '',
            temp5: oldData['temp5'] || '',
            education_details: oldData['education_details'] || '',
            experience_details: oldData['experience_details'] || '',
            internship_details: oldData['internship_details'] || '',
            project_details: oldData['project_details'] || '',
            certification_details: oldData['certification_details'] || '',
            cover_letter: oldData['cover_letter'] || '',
            summary: oldData['summary'] || '',
            current_salary: oldData['current_salary'] || '',
            expected_salary: oldData['expected_salary'] || '',
            notice_period: oldData['notice_period'] || '',
            total_experience: oldData['total_experience'] || '',
            highest_qualification: oldData['highest_qualification'] || '',
            resume_url: oldData['resume_url'] || '',
            portfolio_url: oldData['portfolio_url'] || '',
            github_url: oldData['github_url'] || '',
            linkedin_url: oldData['linkedin_url'] || '',
            willing_to_relocate: oldData['willing_to_relocate'] || '',
            available_joining_date: oldData['available_joining_date'] || ''
          }
        },
        'new': {
          ts_applications: {
            application_id: oldData['application_id'],
            candidate_id: oldData['candidate_id'],
            requisition_id: oldData['requisition_id'],
            source: oldData['source'] || '',
            referred_by: oldData['referred_by'] || '',
            current_stage_id: oldData['current_stage_id'] || '',
            status: newStatus,
            notes: oldData['notes'] || '',
            applied_at: oldData['applied_at'] || '',
            created_at: oldData['created_at'] || '',
            created_by: oldData['created_by'] || '',
            updated_at: oldData['updated_at'] || '',
            updated_by: oldData['updated_by'] || '',
            temp1: oldData['temp1'] || '',
            temp2: oldData['temp2'] || '',
            temp3: oldData['temp3'] || '',
            temp4: oldData['temp4'] || '',
            temp5: oldData['temp5'] || '',
            education_details: oldData['education_details'] || '',
            experience_details: oldData['experience_details'] || '',
            internship_details: oldData['internship_details'] || '',
            project_details: oldData['project_details'] || '',
            certification_details: oldData['certification_details'] || '',
            cover_letter: oldData['cover_letter'] || '',
            summary: oldData['summary'] || '',
            current_salary: oldData['current_salary'] || '',
            expected_salary: oldData['expected_salary'] || '',
            notice_period: oldData['notice_period'] || '',
            total_experience: oldData['total_experience'] || '',
            highest_qualification: oldData['highest_qualification'] || '',
            resume_url: oldData['resume_url'] || '',
            portfolio_url: oldData['portfolio_url'] || '',
            github_url: oldData['github_url'] || '',
            linkedin_url: oldData['linkedin_url'] || '',
            willing_to_relocate: oldData['willing_to_relocate'] || '',
            available_joining_date: oldData['available_joining_date'] || ''
          }
        }
      }
    });
  }

  // ═══════════════════════════════════════════════════════
  //  APPLICATION STAGE HISTORY
  // ═══════════════════════════════════════════════════════

  insertStageHistory(data: {
    application_id: string;
    from_stage_id: string;
    to_stage_id: string;
    changed_by: string;
    comments: string;
  }): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });
    return this.call('UpdateHs_application_stage_history', {
      tuple: {
        'new': {
          hs_application_stage_history: {
            application_id: data.application_id,
            from_stage_id: data.from_stage_id,
            to_stage_id: data.to_stage_id,
            changed_by: data.changed_by,
            changed_at: new Date().toISOString(),
            comments: data.comments,
            temp1: '', temp2: '', temp3: '', temp4: '', temp5: ''
          }
        }
      }
    });
  }

  getStageHistory(applicationId: string): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve([]);
    return this.call('GetHs_application_stage_historyObjectsForapplication_id', {
      Application_id: applicationId
    }).then(resp => this.parseTuples(resp, 'hs_application_stage_history'));
  }

  // ═══════════════════════════════════════════════════════
  //  OFFERS
  // ═══════════════════════════════════════════════════════

  getOffers(): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve(MOCK_OFFERS);
    return this.call('GetTs_offersObjects', {
      fromOffer_id: '0', toOffer_id: 'zzzzzzzzzz'
    }).then(resp => this.parseTuples(resp, 'ts_offers'));
  }

  getOffersByApplication(applicationId: string): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve(MOCK_OFFERS.filter(o => o['application_id'] === applicationId));
    return this.call('GetTs_offersObjectsForapplication_id', {
      Application_id: applicationId
    }).then(resp => this.parseTuples(resp, 'ts_offers'));
  }

  async insertOffer(applicationId: string, offerDetails: any): Promise<any> {
    if (this.useMockData) {
      const nextId = 'OFR-' + Date.now(); // Simplified ID generation for mock
      const newOffer = {
        offer_id: nextId,
        application_id: applicationId,
        candidate_id: offerDetails.candidate_id || '',
        offered_salary: offerDetails.offered_salary || '',
        salary_currency: offerDetails.salary_currency || 'LPA',
        joining_date: offerDetails.joining_date || '',
        expiration_date: offerDetails.expiration_date || '',
        status: offerDetails.status || 'DRAFT',
        created_by_user: offerDetails.created_by_user || '',
        created_at: new Date().toISOString()
      };
      MOCK_OFFERS.push(newOffer);
      return Promise.resolve({ success: true, offer_id: nextId });
    }
    return this.call('UpdateTs_offers', {
      tuple: {
        'new': {
          ts_offers: {
            application_id: applicationId,
            offered_salary: offerDetails.offered_salary || offerDetails.salary || '',
            salary_currency: offerDetails.salary_currency || offerDetails.currency || 'LPA',
            joining_date: offerDetails.joining_date || '',
            expiration_date: offerDetails.expiration_date || '',
            status: offerDetails.status || 'DRAFT',
            created_by_user: offerDetails.created_by_user || '',
            temp1: '', temp2: '', temp3: '', temp4: '', temp5: ''
          }
        }
      }
    });
  }

  /**
   * Send styled emails via Cordys BPM:
   * SOAP: AllMailsBPM(usermail, subject, body)
   */
  sendAllMailsBPM(usermail: string, subject: string, body: string): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });
    const escapeXml = (val: unknown): string => {
      return String(val ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
    };
    // Wrap HTML payloads to avoid breaking the SOAP XML.
    const cdata = (val: string): string => `<![CDATA[${val}]]>`;
    const soapXml = `<SOAP:Envelope xmlns:SOAP="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP:Body>
    <AllMailsBPM xmlns="http://schemas.cordys.com/default">
      <usermail>${escapeXml(usermail)}</usermail>
      <subject>${escapeXml(subject)}</subject>
      <body>${cdata(body)}</body>
    </AllMailsBPM>
  </SOAP:Body>
</SOAP:Envelope>`;

    return this.call(
      'AllMailsBPM',
      {},
      'http://schemas.cordys.com/default',
      soapXml
    );
  }

  /**
   * Cordys Business Calendar — whether a given instant is working time.
   * SOAP: isWorkingTime (namespace BusinessCalendar/1.0)
   *
   * @param calendarName e.g. `Calendar/RMS_HR` (must match Cordys calendar definition).
   * @param dateTimeUtc  ISO datetime in UTC (e.g. `new Date(...).toISOString()`).
   *
   * **Weekends / holidays:** If the calendar in Cordys excludes Sat/Sun and public holidays,
   * you do **not** need a separate Sat/Sun check in code — the service should return false.
   * Use `isWeekendUtc` from `shared/working-time` only as a quick client hint or mock fallback.
   */
  async isWorkingTime(calendarName: string, dateTimeUtc: string): Promise<boolean> {
    if (this.useMockData) {
      const d = new Date(dateTimeUtc);
      if (isNaN(d.getTime())) return false;
      return !isWeekendUtc(d);
    }

    const BC_NS = 'http://schemas.cordys.com/buscalendar/runtime/BusinessCalendar/1.0';
    const escapeXml = (val: unknown): string => {
      const apos = '&apos;';
      return String(val ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", apos);
    };

    const cal = calendarName || RMS_HR_BUSINESS_CALENDAR_NAME;
    const soapXml = `<SOAP:Envelope xmlns:SOAP="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP:Body>
    <isWorkingTime xmlns="${BC_NS}" jobID="" async="">
      <calendarName>${escapeXml(cal)}</calendarName>
      <dateTime>${escapeXml(dateTimeUtc)}</dateTime>
    </isWorkingTime>
  </SOAP:Body>
</SOAP:Envelope>`;

    const resp = await this.call('isWorkingTime', {}, BC_NS, soapXml);
    return this.parseIsWorkingTimeResponse(resp);
  }

  /**
   * Best-effort parse — Cordys JSON shape may differ; adjust after you see a real response.
   */
  private parseIsWorkingTimeResponse(resp: any): boolean {
    if (resp === true || resp === false) return resp;
    if (typeof resp === 'string') {
      const t = resp.trim().toLowerCase();
      if (t === 'true') return true;
      if (t === 'false') return false;
    }
    const keys = [
      'isWorkingTimeResult',
      'IsWorkingTimeResult',
      'result',
      'Result',
      'isWorkingTime',
      'value',
      'Value'
    ];
    for (const k of keys) {
      try {
        const v = $.cordys?.json?.find?.(resp, k);
        if (v === true || v === false) return v;
        if (typeof v === 'string') {
          const s = v.trim().toLowerCase();
          if (s === 'true') return true;
          if (s === 'false') return false;
        }
      } catch {
        /* continue */
      }
    }
    console.warn('[SoapService] isWorkingTime: could not parse response, defaulting to false', resp);
    return false;
  }

  updateOfferStatus(offerId: string, newStatus: string): Promise<any> {
    if (this.useMockData) {
      const offer = MOCK_OFFERS.find(o => o['offer_id'] === offerId);
      if (offer) offer['status'] = newStatus;
      return Promise.resolve({ success: true });
    }
    // For Cordys, we need old+new tuple; simplified here
    return this.call('UpdateTs_offers', {
      tuple: {
        old: { ts_offers: { offer_id: offerId } },
        'new': { ts_offers: { offer_id: offerId, status: newStatus } }
      }
    });
  }

  // ═══════════════════════════════════════════════════
  //  DELEGATES  (real SOAP — ts_delegations table)
  // ═══════════════════════════════════════════════════

  async getDelegates(managerId: string): Promise<string[]> {
    if (this.useMockData) {
      await this.delay(300);
      const existing = MOCK_DELEGATES.find(d => d.manager_id === managerId);
      return existing ? [...existing.delegate_ids] : [];
    }
    const resp = await this.call('GetTs_delegationsObjectsFordelegator_user_id', {
      Delegator_user_id: managerId
    });
    const rows = this.parseTuples(resp, 'ts_delegations');
    return rows
      .filter(r => (r['status'] || 'ACTIVE') === 'ACTIVE')
      .map(r => r['delegate_user_id'] || '');
  }

  async getDelegationRecords(managerId: string): Promise<Record<string, string>[]> {
    if (this.useMockData) return [];
    const resp = await this.call('GetTs_delegationsObjectsFordelegator_user_id', {
      Delegator_user_id: managerId
    });
    return this.parseTuples(resp, 'ts_delegations');
  }

  insertDelegation(data: {
    delegator_user_id: string;
    delegate_user_id: string;
    start_date: string;
    end_date: string;
    reason: string;
  }): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });
    return this.call('UpdateTs_delegations', {
      tuple: {
        'new': {
          ts_delegations: {
            '@qAccess': '0',
            '@qConstraint': '0',
            '@qInit': '0',
            '@qValues': '',
            delegator_user_id: data.delegator_user_id,
            delegate_user_id: data.delegate_user_id,
            start_date: data.start_date,
            end_date: data.end_date,
            status: 'ACTIVE',
            reason: data.reason || '',
            created_at: new Date().toISOString(),
            created_by: data.delegator_user_id,
            updated_at: new Date().toISOString(),
            updated_by: data.delegator_user_id,
            temp1: '', temp2: '', temp3: '', temp4: '', temp5: ''
          }
        }
      }
    });
  }

  deleteDelegation(oldData: Record<string, string>): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });
    return this.call('UpdateTs_delegations', {
      tuple: {
        old: {
          ts_delegations: {
            delegation_id: oldData['delegation_id'],
            delegator_user_id: oldData['delegator_user_id'] || '',
            delegate_user_id: oldData['delegate_user_id'] || '',
            start_date: oldData['start_date'] || '',
            end_date: oldData['end_date'] || '',
            status: oldData['status'] || '',
            reason: oldData['reason'] || '',
            created_at: oldData['created_at'] || '',
            created_by: oldData['created_by'] || '',
            updated_at: oldData['updated_at'] || '',
            updated_by: oldData['updated_by'] || '',
            temp1: oldData['temp1'] || '',
            temp2: oldData['temp2'] || '',
            temp3: oldData['temp3'] || '',
            temp4: oldData['temp4'] || '',
            temp5: oldData['temp5'] || ''
          }
        },
        'new': {
          ts_delegations: {
            delegation_id: oldData['delegation_id'],
            delegator_user_id: oldData['delegator_user_id'] || '',
            delegate_user_id: oldData['delegate_user_id'] || '',
            start_date: oldData['start_date'] || '',
            end_date: oldData['end_date'] || '',
            status: 'INACTIVE',
            reason: oldData['reason'] || '',
            created_at: oldData['created_at'] || '',
            created_by: oldData['created_by'] || '',
            updated_at: oldData['updated_at'] || '',
            updated_by: oldData['updated_by'] || '',
            temp1: oldData['temp1'] || '',
            temp2: oldData['temp2'] || '',
            temp3: oldData['temp3'] || '',
            temp4: oldData['temp4'] || '',
            temp5: oldData['temp5'] || ''
          }
        }
      }
    });
  }

  async updateDelegates(managerId: string, delegateIds: string[]): Promise<any> {
    if (this.useMockData) {
      await this.delay(500);
      const existingPos = MOCK_DELEGATES.findIndex(d => d.manager_id === managerId);
      if (existingPos >= 0) {
        MOCK_DELEGATES[existingPos].delegate_ids = [...delegateIds];
      } else {
        MOCK_DELEGATES.push({ manager_id: managerId, delegate_ids: [...delegateIds] });
      }
      return { success: true };
    }

    // Real SOAP: get existing delegation records, diff, insert/delete
    const existing = await this.getDelegationRecords(managerId);
    const existingMap = new Map<string, Record<string, string>>();
    existing.forEach(r => existingMap.set(r['delegate_user_id'] || '', r));

    const newSet = new Set(delegateIds);
    const existingIds = new Set(existingMap.keys());

    // Insert new delegations
    const today = new Date().toISOString().split('T')[0];
    const endDate = new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0];
    for (const id of delegateIds) {
      if (!existingIds.has(id)) {
        await this.insertDelegation({
          delegator_user_id: managerId,
          delegate_user_id: id,
          start_date: today,
          end_date: endDate,
          reason: 'Delegated via Delegates page'
        });
      }
    }

    // Deactivate removed delegations
    for (const [id, record] of existingMap) {
      if (!newSet.has(id) && (record['status'] || 'ACTIVE') === 'ACTIVE') {
        await this.deleteDelegation(record);
      }
    }

    return { success: true };
  }

  // ═══════════════════════════════════════════════════
  //  BPM WORKFLOW
  // ═══════════════════════════════════════════════════

  /**
   * Build the Cordys distinguished name from an email address.
   */
  _makeDN(email: string): string {
    return `cn=${email},cn=organizational users,o=training2025,cn=cordys,cn=defaultInst,o=adnateitsolutions.com`;
  }

  /**
   * Trigger the BPM process for a job requisition.
   * Calls RequisitionTaskIDGenerationBPM in the default namespace.
   */
  triggerRequisitionBPM(managerEmail: string, requisitionId: string): Promise<any> {
    const dn = this._makeDN(managerEmail);
    return this.call('RequisitionTaskIDGenerationBPM', {
      dn: dn,
      requisition_id: requisitionId
    }, 'http://schemas.cordys.com/default');
  }

  /**
   * Pick Cordys/ts_users email from a user row (SOAP tuple casing varies).
   */
  private pickUserEmailFromRow(row: Record<string, string> | null | undefined): string {
    if (!row) return '';
    return String(row['email'] || row['Email'] || '').trim();
  }

  /**
   * Resolve the org user email used for ApplicationTaskIDGenerationBPM `dn`.
   * The BPM assignee must be the intended task owner — not assumed to be the logged-in session user.
   *
   * Resolution order:
   * 1) Explicit assigneeUserId (e.g. selected HR interviewer for a scheduled HR round)
   * 2) Job requisition owner: ts_job_requisitions.created_by_user → ts_users.email
   * 3) fallbackEmail (e.g. current HR user) when data is missing
   */
  async resolveApplicationBpmAssigneeEmail(
    applicationRow: Record<string, string>,
    opts?: { assigneeUserId?: string; fallbackEmail?: string }
  ): Promise<string> {
    const fallback = (opts?.fallbackEmail || '').trim();

    const emailForUserId = async (userId: string): Promise<string> => {
      if (!userId) return '';
      const u = await this.getUserById(userId);
      return this.pickUserEmailFromRow(u);
    };

    if (opts?.assigneeUserId) {
      const e = await emailForUserId(opts.assigneeUserId);
      if (e) return e;
    }

    const reqId = String(applicationRow['requisition_id'] || applicationRow['Requisition_id'] || '').trim();
    if (reqId) {
      const req = await this.getJobRequisitionById(reqId);
      const ownerId = String(
        req?.['created_by_user'] || req?.['Created_by_user'] || ''
      ).trim();
      if (ownerId) {
        const e = await emailForUserId(ownerId);
        if (e) return e;
      }
    }

    return fallback;
  }

  /**
   * Trigger BPM for a candidate application task id generation.
   * Calls ApplicationTaskIDGenerationBPM in the default namespace.
   * @param assigneeEmail Cordys identity email for the user who should receive the BPM task (builds DN).
   */
  triggerApplicationTaskIDGenerationBPM(assigneeEmail: string, applicationId: string): Promise<any> {
    const dn = this._makeDN(assigneeEmail);
    return this.call('ApplicationTaskIDGenerationBPM', {
      dn,
      application_id: applicationId
    }, 'http://schemas.cordys.com/default');
  }

  /**
   * Complete or act on a Cordys BPM task.
   */
  performTaskAction(taskId: string, action: string, data?: any): Promise<any> {
    const params: any = {
      TaskId: taskId,
      Action: action
    };
    if (data) params.Data = data;
    return this.call('PerformTaskAction', params,
      'http://schemas.cordys.com/notification/workflow/1.0');
  }

  /**
   * Delegate a BPM task to another user.
   */
  delegateBPMTask(taskId: string, userDN: string, memo: string, dueDate: string): Promise<any> {
    return this.call('DelegateTask', {
      TaskId: taskId,
      TransferOwnership: 'true',
      Memo: memo,
      SendTo: { UserDN: userDN },
      DueDate: dueDate
    }, 'http://schemas.cordys.com/notification/workflow/1.0');
  }

  /**
   * Fetch single candidate application by id (GetTs_applicationsObject).
   * Used to refetch latest row for temp column updates (temp1/temp2).
   */
  async getApplicationById(applicationId: string): Promise<Record<string, string> | null> {
    if (this.useMockData) {
      const row = MOCK_APPLICATIONS.find((a: any) => a.application_id === applicationId);
      return row || null;
    }

    const resp = await this.call('GetTs_applicationsObject', {
      Application_id: applicationId
    });
    const rows = this.parseTuples(resp, 'ts_applications');
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Update only temp columns (+ optional status) for a candidate application.
   * Mirrors updateJobRequisitionTemp but for ts_applications.
   */
  updateApplicationTemp(
    oldApp: Record<string, string>,
    updates: { temp1?: string; temp2?: string; temp3?: string; temp4?: string; temp5?: string; status?: string; current_stage_id?: string }
  ): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });

    const buildRow = (overrides: Record<string, string> = {}) => ({
      application_id: oldApp['application_id'],
      candidate_id: oldApp['candidate_id'],
      requisition_id: oldApp['requisition_id'],
      source: oldApp['source'] || '',
      referred_by: oldApp['referred_by'] || '',
      current_stage_id: overrides['current_stage_id'] !== undefined ? overrides['current_stage_id'] : (oldApp['current_stage_id'] || ''),
      status: overrides['status'] !== undefined ? overrides['status'] : (oldApp['status'] || ''),
      notes: oldApp['notes'] || '',
      applied_at: oldApp['applied_at'] || '',
      created_at: oldApp['created_at'] || '',
      created_by: oldApp['created_by'] || '',
      updated_at: oldApp['updated_at'] || '',
      updated_by: oldApp['updated_by'] || '',
      temp1: overrides['temp1'] !== undefined ? overrides['temp1'] : (oldApp['temp1'] || ''),
      temp2: overrides['temp2'] !== undefined ? overrides['temp2'] : (oldApp['temp2'] || ''),
      temp3: overrides['temp3'] !== undefined ? overrides['temp3'] : (oldApp['temp3'] || ''),
      temp4: overrides['temp4'] !== undefined ? overrides['temp4'] : (oldApp['temp4'] || ''),
      temp5: overrides['temp5'] !== undefined ? overrides['temp5'] : (oldApp['temp5'] || ''),

      // JSONB columns (already stringified JSON in this project)
      education_details: oldApp['education_details'] || '',
      experience_details: oldApp['experience_details'] || '',
      internship_details: oldApp['internship_details'] || '',
      project_details: oldApp['project_details'] || '',
      certification_details: oldApp['certification_details'] || '',
      cover_letter: oldApp['cover_letter'] || '',
      summary: oldApp['summary'] || '',
      current_salary: oldApp['current_salary'] || '',
      expected_salary: oldApp['expected_salary'] || '',
      notice_period: oldApp['notice_period'] || '',
      total_experience: oldApp['total_experience'] || '',
      highest_qualification: oldApp['highest_qualification'] || '',
      resume_url: oldApp['resume_url'] || '',
      portfolio_url: oldApp['portfolio_url'] || '',
      github_url: oldApp['github_url'] || '',
      linkedin_url: oldApp['linkedin_url'] || '',
      willing_to_relocate: oldApp['willing_to_relocate'] || '',
      available_joining_date: oldApp['available_joining_date'] || '',
    });

    return this.call('UpdateTs_applications', {
      tuple: {
        old: {
          ts_applications: buildRow()
        },
        'new': {
          ts_applications: buildRow(updates as any)
        }
      }
    });
  }

  /**
   * Mark a single interview row status (UpdateTs_interviews).
   */
  updateInterviewStatus(interviewId: string, newStatus: string): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });
    return this.call('UpdateTs_interviews', {
      tuple: {
        old: { ts_interviews: { interview_id: interviewId } },
        'new': { ts_interviews: { interview_id: interviewId, status: newStatus } }
      }
    });
  }

  /**
   * Get all interviews for an application (GetTs_interviewsObjectsForapplication_id).
   */
  getInterviewsForApplication(applicationId: string): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve([]);
    return this.call('GetTs_interviewsObjectsForapplication_id', {
      Application_id: applicationId
    }).then(resp => this.parseTuples(resp, 'ts_interviews'));
  }

  /**
   * Get slot->interviewer mappings for a given slot.
   * SOAP: GetTs_interview_slot_interviewersObjectsForslot_id(Slot_id)
   */
  getInterviewSlotInterviewersForSlot(slotId: string): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve([]);
    return this.call('GetTs_interview_slot_interviewersObjectsForslot_id', {
      Slot_id: slotId
    }).then(resp => this.parseTuples(resp, 'ts_interview_slot_interviewers'));
  }

  /**
   * Get all feedback rows for a given interview.
   * SOAP: GetTs_interview_feedbackObjectsForinterview_id(Interview_id)
   */
  getInterviewFeedbackForInterview(interviewId: string): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve([]);
    return this.call('GetTs_interview_feedbackObjectsForinterview_id', {
      Interview_id: interviewId
    }).then(resp => this.parseTuples(resp, 'ts_interview_feedback'));
  }

  /**
   * Get interview->interviewer mappings.
   * SOAP: GetTs_interviewersObjectsForinterview_id(Interview_id)
   */
  getInterviewersForInterview(interviewId: string): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve([]);
    return this.call('GetTs_interviewersObjectsForinterview_id', {
      Interview_id: interviewId
    }).then(resp => this.parseTuples(resp, 'ts_interviewers'));
  }

  /**
   * Get all interview slots created by a specific interviewer/creator.
   * SOAP: GetTs_interview_slotsObjectsForcreated_by_user(Created_by_user)
   */
  getInterviewSlotsForCreatedByUser(userId: string): Promise<Record<string, string>[]> {
    if (this.useMockData) return Promise.resolve([]);
    return this.call('GetTs_interview_slotsObjectsForcreated_by_user', {
      Created_by_user: userId
    }).then(resp => this.parseTuples(resp, 'ts_interview_slots'));
  }

  /**
   * Mark a slot as booked (`temp1` = '1') or available (`temp1` = '0').
   * Matches interviewer portal: `temp1` '0' = available, '1' = booked.
   */
  markInterviewSlotBooked(slotId: string, booked: boolean): Promise<void> {
    if (this.useMockData || !slotId) return Promise.resolve();
    const flag = booked ? '1' : '0';
    return this.call('UpdateTs_interview_slots', {
      tuple: {
        old: { ts_interview_slots: { slot_id: slotId } },
        new: { ts_interview_slots: { slot_id: slotId, temp1: flag } }
      }
    }).then(() => undefined);
  }

  /**
   * Feedback completeness gate for a round.
   * Returns true only when every interviewer assigned to every interview in that (application, round, type)
   * has submitted at least one feedback row.
   */
  async isRoundFeedbackComplete(
    applicationId: string,
    roundNumber: string | number,
    interviewType: string
  ): Promise<boolean> {
    if (this.useMockData) return true;

    const roundNumStr = String(roundNumber);
    const allInterviews = await this.getInterviewsForApplication(applicationId);
    const targetInterviews = (allInterviews || []).filter(iv => {
      const rn = String(iv['round_number'] || iv['roundNumber'] || '');
      const it = String(iv['interview_type'] || '');
      return rn === roundNumStr && it.toUpperCase() === String(interviewType).toUpperCase();
    });

    if (targetInterviews.length === 0) return false;

    for (const iv of targetInterviews) {
      const interviewId = String(iv['interview_id'] || iv['Interview_id'] || '');
      const slotId = String(iv['slot_id'] || iv['Slot_id'] || '');
      if (!interviewId) return false;

      // Expected interviewers come from the slot->interviewer mapping.
      // This matches how candidate UI renders interviewer chips and how feedback ties via interviewer_id.
      const slotInterviewers = await this.getInterviewSlotInterviewersForSlot(slotId);
      const expectedInterviewerIds = Array.from(new Set((slotInterviewers || []).map(r => String(r['user_id'] || r['User_id'] || ''))))
        .filter(Boolean);

      if (expectedInterviewerIds.length === 0) {
        return false; // U1 is expected to be compulsory
      }

      const feedbackRows = await this.getInterviewFeedbackForInterview(interviewId);
      const feedbackInterviewerIds = new Set(
        (feedbackRows || []).map(r => String(r['interviewer_id'] || r['Interviewer_id'] || ''))
      );

      const allHaveFeedback = expectedInterviewerIds.every(uid => feedbackInterviewerIds.has(uid));
      if (!allHaveFeedback) return false;
    }

    return true;
  }

  /**
   * Create an interview round (technical or HR) and assign multiple interviewers.
   *
   * Notes (important for your DB model):
   * - `ts_interviews` stores a single `slot_id` per interview row.
   * - Multiple interviewers are attached using:
   *   - `ts_interviewers(interview_id, user_id)`
   *   - `ts_interview_slot_interviewers(slot_id, user_id)` (used by candidate UI chips)
   *
   * Therefore, you should pass the chosen slot_id (selected for the compulsory first interviewer U1),
   * and pass all interviewer user_ids that HR decided to add for this round.
   */
  async createInterviewRound(
    applicationId: string,
    roundNumber: string | number,
    interviewType: string,
    slotId: string,
    interviewerUserIds: string[],
    createdByUser: string,
    meetingLink: string = ''
  ): Promise<string> {
    if (this.useMockData) return Promise.resolve('INT-' + Date.now());

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const roundStr = String(roundNumber);
    const interviewTypeStr = String(interviewType);

    // 1) Insert ts_interviews row
    await this.call('UpdateTs_interviews', {
      tuple: {
        'new': {
          ts_interviews: {
            application_id: applicationId,
            interview_type: interviewTypeStr,
            round_number: roundStr,
            slot_id: slotId,
            meeting_link: meetingLink || '',
            status: 'SCHEDULED',
            created_by_user: createdByUser,
            created_at: now,
            created_by: createdByUser,
            updated_at: now,
            updated_by: createdByUser,
            temp1: '', temp2: '', temp3: '', temp4: '', temp5: ''
          }
        }
      }
    });

    // 2) Retrieve generated interview_id by reading back newest matching interviews.
    // Read-back: Cordys may take a moment to commit the insert, and field casing can vary.
    // Also: slot_id sometimes comes back empty initially, so we do NOT hard-require slot_id match.
    const extractInterviewId = (row: any): string => {
      const direct = [
        row?.['interview_id'],
        row?.['Interview_id'],
        row?.['interviewId'],
        row?.['InterviewId'],
        row?.['interviewID'],
        row?.['InterviewID']
      ].find(v => v !== undefined && v !== null && String(v).trim().length > 0);
      if (direct !== undefined) return String(direct);

      const keys = Object.keys(row || {});
      const key = keys.find(k => {
        const kl = k.toLowerCase();
        return (
          kl === 'interview_id' ||
          kl === 'interviewid' ||
          (kl.includes('interview') && kl.endsWith('id')) ||
          (kl.includes('interview') && kl.includes('id'))
        );
      });
      return key ? String(row[key] || '').trim() : '';
    };

    let interviewId = '';
    for (let attempt = 0; attempt < 10; attempt++) {
      const all = await this.getInterviewsForApplication(applicationId);
      const candidates = (all || []).filter(iv => {
        const it = String(iv['interview_type'] || iv['Interview_type'] || iv['interviewType'] || '');
        const rn = String(
          iv['round_number'] || iv['Round_number'] || iv['roundNumber'] || iv['RoundNumber'] || iv['round'] || ''
        );
        return it === interviewTypeStr && rn === roundStr;
      });

      candidates.sort((a: any, b: any) => {
        const da = a['created_at'] || a['Created_at'] || '';
        const db = b['created_at'] || b['Created_at'] || '';
        return db.localeCompare(da);
      });

      // Try newest candidates first and return the first row with a non-empty PK
      for (const row of candidates) {
        const id = extractInterviewId(row);
        if (id) {
          interviewId = id;
          break;
        }
      }

      if (interviewId) break;
      await this.delay(400);
    }

    if (!interviewId) {
      throw new Error('Interview_id not found after round creation (read-back returned matching rows but no PK).');
    }

    // 3) Insert interviewers + slot-interviewer mappings (avoid duplicates)
    const existingInterviewers = await this.getInterviewersForInterview(interviewId);
    const existingInterviewerSet = new Set((existingInterviewers || []).map(r => String(r['user_id'] || r['User_id'] || '')));

    const existingSlotInterviewers = await this.getInterviewSlotInterviewersForSlot(slotId);
    const existingSlotInterviewerSet = new Set((existingSlotInterviewers || []).map(r => String(r['user_id'] || r['User_id'] || '')));

    for (const uid of interviewerUserIds || []) {
      const interviewerId = String(uid);
      if (!interviewerId) continue;

      if (!existingInterviewerSet.has(interviewerId)) {
        await this.call('UpdateTs_interviewers', {
          tuple: {
            'new': {
              ts_interviewers: {
                interview_id: interviewId,
                user_id: interviewerId,
                created_at: now,
                created_by: createdByUser,
                updated_at: now,
                updated_by: createdByUser,
                temp1: '', temp2: '', temp3: '', temp4: '', temp5: ''
              }
            }
          }
        });
      }

      if (!existingSlotInterviewerSet.has(interviewerId)) {
        await this.call('UpdateTs_interview_slot_interviewers', {
          tuple: {
            'new': {
              ts_interview_slot_interviewers: {
                slot_id: slotId,
                user_id: interviewerId,
                created_at: now,
                created_by: createdByUser,
                updated_at: now,
                updated_by: createdByUser,
                temp1: '', temp2: '', temp3: '', temp4: '', temp5: ''
              }
            }
          }
        });
      }
    }

    try {
      await this.markInterviewSlotBooked(slotId, true);
    } catch (e) {
      console.error('[SoapService] markInterviewSlotBooked failed after createInterviewRound:', e);
    }

    return interviewId;
  }

  /**
   * Cancel all interviews belonging to an application.
   */
  async cancelApplicationInterviews(applicationId: string): Promise<void> {
    if (this.useMockData) return;
    const interviews = await this.getInterviewsForApplication(applicationId);
    for (const iv of (interviews || [])) {
      const interviewId = String(iv['interview_id'] || iv['Interview_id'] || '');
      if (!interviewId) continue;
      await this.updateInterviewStatus(interviewId, 'CANCELLED');
    }
  }

  // ═══════════════════════════════════════════════════
  //  JOB REQUISITION TEMP UPDATE
  // ═══════════════════════════════════════════════════

  /**
   * Update specific temp columns and optionally status on a job requisition.
   */
  updateJobRequisitionTemp(
    oldData: Record<string, string>,
    updates: {
      temp1?: string;
      temp2?: string;
      temp3?: string;
      temp4?: string;
      temp5?: string;
      status?: string;
    }
  ): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });
    const buildRow = (overrides: Record<string, string> = {}) => ({
      requisition_id: oldData['requisition_id'],
      title: oldData['title'] || '',
      department_id: oldData['department_id'] || '',
      description: oldData['description'] || '',
      experience_min: oldData['experience_min'] || '',
      experience_max: oldData['experience_max'] || '',
      salary_min: oldData['salary_min'] || '',
      salary_max: oldData['salary_max'] || '',
      salary_currency: oldData['salary_currency'] || '',
      open_positions: oldData['open_positions'] || '',
      status: overrides['status'] !== undefined ? overrides['status']! : (oldData['status'] || ''),
      posting_source: oldData['posting_source'] || '',
      created_by_user: oldData['created_by_user'] || '',
      created_at: oldData['created_at'] || '',
      created_by: oldData['created_by'] || '',
      updated_at: oldData['updated_at'] || '',
      updated_by: oldData['updated_by'] || '',
      temp1: overrides['temp1'] !== undefined ? overrides['temp1'] : (oldData['temp1'] || ''),
      temp2: overrides['temp2'] !== undefined ? overrides['temp2'] : (oldData['temp2'] || ''),
      temp3: overrides['temp3'] !== undefined ? overrides['temp3'] : (oldData['temp3'] || ''),
      temp4: overrides['temp4'] !== undefined ? overrides['temp4'] : (oldData['temp4'] || ''),
      temp5: overrides['temp5'] !== undefined ? overrides['temp5'] : (oldData['temp5'] || '')
    });
    return this.call('UpdateTs_job_requisitions', {
      tuple: {
        old: { ts_job_requisitions: buildRow() },
        'new': { ts_job_requisitions: buildRow(updates as any) }
      }
    });
  }

  /**
   * Full update of a job requisition row (for edit & resubmit).
   */
  updateJobRequisition(
    oldData: Record<string, string>,
    newData: Record<string, string>
  ): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });
    const buildRow = (d: Record<string, string>) => ({
      requisition_id: d['requisition_id'] || oldData['requisition_id'],
      title: d['title'] || '',
      department_id: d['department_id'] || '',
      description: d['description'] || '',
      experience_min: d['experience_min'] || '',
      experience_max: d['experience_max'] || '',
      salary_min: d['salary_min'] || '',
      salary_max: d['salary_max'] || '',
      salary_currency: d['salary_currency'] || '',
      open_positions: d['open_positions'] || '',
      status: d['status'] || '',
      posting_source: d['posting_source'] || '',
      created_by_user: d['created_by_user'] || '',
      created_at: d['created_at'] || '',
      created_by: d['created_by'] || '',
      updated_at: d['updated_at'] || '',
      updated_by: d['updated_by'] || '',
      temp1: d['temp1'] || '',
      temp2: d['temp2'] || '',
      temp3: d['temp3'] || '',
      temp4: d['temp4'] || '',
      temp5: d['temp5'] || ''
    });
    return this.call('UpdateTs_job_requisitions', {
      tuple: {
        old: { ts_job_requisitions: buildRow(oldData) },
        'new': { ts_job_requisitions: buildRow(newData) }
      }
    });
  }

  // ═══════════════════════════════════════════════════
  //  APPROVAL HISTORY  (uses ts_approvals table)
  // ═══════════════════════════════════════════════════

  /**
   * Insert an approval history record into ts_approvals.
   * action: SUBMITTED | APPROVED | REJECTED | DELEGATED | RESUBMITTED
   */
  insertApprovalHistory(data: {
    requisition_id: string;
    action: string;
    requested_by: string;
    approved_by?: string;
    comments: string;
  }): Promise<any> {
    if (this.useMockData) return Promise.resolve({ success: true });
    // approval_status_enum only allows: PENDING, APPROVED, REJECTED
    // Store the real action type (SUBMITTED, DELEGATED, RESUBMITTED) in temp1/comments
    let dbStatus = 'PENDING';
    if (data.action === 'APPROVED') dbStatus = 'APPROVED';
    else if (data.action === 'REJECTED') dbStatus = 'REJECTED';
    
    // Fallback to "system" if no user provided (to avoid FK violation)
    const reqBy = data.requested_by || 'system';

    const approvalObj: any = {
      entity_type: 'REQUISITION',
      entity_id: data.requisition_id,
      status: dbStatus,
      requested_by: reqBy,
      comments: `[${data.action}] ${data.comments}`,
      requested_at: new Date().toISOString(),
      temp1: data.action,
      temp2: '', temp3: '', temp4: '', temp5: ''
    };

    if (data.approved_by) {
      approvalObj.approved_by = data.approved_by;
      approvalObj.approved_at = new Date().toISOString();
    }

    return this.call('UpdateTs_approvals', {
      tuple: {
        'new': {
          ts_approvals: approvalObj
        }
      }
    });
  }

  /**
   * Get all approval history records for a given requisition.
   */
  async getApprovalHistoryByRequisition(requisitionId: string): Promise<Record<string, string>[]> {
    if (this.useMockData) return [];
    const resp = await this.call('GetTs_approvalsObjects', {
      fromApproval_id: '0', toApproval_id: 'zzzzzzzzzz'
    });
    const allRows = this.parseTuples(resp, 'ts_approvals');
    return allRows.filter(r => r['entity_id'] === requisitionId && r['entity_type'] === 'REQUISITION');
  }
}

