// Fields whose programs train students for one licensed job. Pages for these
// fields compare graduates' pay with pay in that job (state, metro, national).
// All other fields only list the occupations the federal crosswalk links to them,
// without claiming graduates work in any one of them.
//
// `pluralName` is used inside sentences ("registered nurses in Texas earn ...").

export type MatchingOccupation = {
  socCode: string
  pluralName: string
  // Singular, for sentences like "The median Texas RN earns ...".
  shortName: string
}

export const MATCHING_OCCUPATIONS: Record<string, MatchingOccupation> = {
  '5138': { socCode: '29-1141', pluralName: 'registered nurses', shortName: 'RN' },
  '5139': {
    socCode: '29-2061',
    pluralName: 'licensed practical and vocational nurses',
    shortName: 'LPN or LVN',
  },
  '1204': {
    socCode: '39-5012',
    pluralName: 'hairdressers, hairstylists, and cosmetologists',
    shortName: 'cosmetologist',
  },
  '5135': { socCode: '31-9011', pluralName: 'massage therapists', shortName: 'massage therapist' },
  '4603': { socCode: '47-2111', pluralName: 'electricians', shortName: 'electrician' },
  '4702': {
    socCode: '49-9021',
    pluralName: 'heating, air conditioning, and refrigeration mechanics and installers',
    shortName: 'HVAC technician',
  },
}
