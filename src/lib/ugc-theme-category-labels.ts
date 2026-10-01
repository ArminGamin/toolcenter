/** Lithuanian display labels for theme pool categories (keys stay English for API/storage). */
export const UGC_THEME_CATEGORY_LT: Record<string, string> = {
  'Random theme': 'Atsitiktinė tema (visos kategorijos)',
  'Body & weight goals': 'Kūnas ir svorio tikslai',
  'Health conditions': 'Sveikatos būklės',
  'Life stages & milestones': 'Gyvenimo etapai',
  'Dietary approaches': 'Mitybos būdai',
  'Lifestyle & convenience': 'Gyvenimo būdas ir patogumas',
  'Emotional & psychological': 'Emocinė ir psichologinė',
  'Fitness & energy': 'Fitnesas ir energija',
  Demographics: 'Demografija',
  'Seasonal hooks': 'Sezoninės temos',
  'Wellness-adjacent': 'Gerovė',
  'Objections & pain points': 'Prieštaravimai ir skaudžios vietos',
  'Transformation & social proof': 'Transformacija ir socialinis įrodymas',
  'Save money & budget': 'Pinigų taupymas ir biudžetas',
  'Reduce food waste': 'Mažiau maisto švaistymo',
  'Planning & personalisation': 'Planavimas ir personalizacija',
}

export function ugcThemeCategoryLabel(category: string): string {
  return UGC_THEME_CATEGORY_LT[category] ?? category
}
