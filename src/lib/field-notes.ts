// Notes about how a field's data is grouped, shown wherever programs are compared.
// Each note is about the data in general and names no school, because the data
// can't tell which programs it applies to.

const NURSING_CIP = '5138'
const BACHELORS = 3

// College Scorecard groups RN-to-BSN programs (for nurses who are already licensed
// and working) with programs for new students under the same field and credential.
export function comparisonNote(cipCode: string, credentialLevel: number) {
  if (cipCode === NURSING_CIP && credentialLevel === BACHELORS) {
    return "Some nursing bachelor's programs are for nurses who are already licensed and working (RN-to-BSN). College Scorecard counts them with programs for new students, and their graduates' pay reflects years of nursing experience, so high pay at a program here may not mean higher starting pay for a new nurse."
  }
  return undefined
}
