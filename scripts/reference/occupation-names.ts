// Plain names for BLS occupations whose official titles read badly in headings and
// sentences ("Cooks, Restaurant", "Architects, Except Landscape and Naval"). Every
// other occupation uses its BLS title. Names stay plural, like the BLS titles,
// and pages show the official title too.
//
// Inside sentences a name is lowercased word by word, keeping words written in
// capitals (HVAC).

export const OCCUPATION_NAMES: Record<string, string> = {
  '11-9072': 'Entertainment and Recreation Managers',
  '17-1011': 'Architects',
  '17-2072': 'Electronics Engineers',
  '17-2111': 'Health and Safety Engineers',
  '19-1042': 'Medical Scientists',
  '19-2041': 'Environmental Scientists and Specialists',
  '19-2042': 'Geoscientists',
  '19-4042': 'Environmental Science and Protection Technicians',
  '19-4043': 'Geological Technicians',
  '21-2021': 'Religious Activities Directors',
  '25-2011': 'Preschool Teachers',
  '25-2021': 'Elementary School Teachers',
  '25-2022': 'Middle School Teachers',
  '25-2031': 'High School Teachers',
  '25-2051': 'Preschool Special Education Teachers',
  '25-2057': 'Middle School Special Education Teachers',
  '25-2058': 'High School Special Education Teachers',
  '27-4031': 'Camera Operators',
  '35-2012': 'Institution and Cafeteria Cooks',
  '35-2014': 'Restaurant Cooks',
  '41-4012': 'Wholesale and Manufacturing Sales Representatives',
  '43-6014': 'Secretaries and Administrative Assistants',
  '43-9061': 'General Office Clerks',
  '49-2095': 'Powerhouse and Substation Electrical Repairers',
  '49-3042': 'Mobile Heavy Equipment Mechanics',
  '49-9012': 'Control and Valve Installers and Repairers',
  '49-9021': 'HVAC Mechanics and Installers',
  '49-9043': 'Machinery Maintenance Workers',
  '51-4031': 'Cutting and Press Machine Operators',
}
