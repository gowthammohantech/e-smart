import { INDIAN_STATES } from '@/data/masters';

/**
 * Major cities and towns for each GST state code, so a city can be picked
 * rather than typed. Not exhaustive — the city picker always lets the user
 * keep whatever they type, so smaller places are still reachable.
 */
export const CITIES_BY_STATE: Record<string, string[]> = {
  // Jammu and Kashmir
  '01': [
    'Anantnag', 'Awantipora', 'Bandipora', 'Baramulla', 'Budgam', 'Doda', 'Ganderbal', 'Handwara',
    'Jammu', 'Kathua', 'Kishtwar', 'Kulgam', 'Kupwara', 'Poonch', 'Pulwama', 'Rajouri', 'Ramban',
    'Reasi', 'Samba', 'Shopian', 'Srinagar', 'Udhampur',
  ],
  // Himachal Pradesh
  '02': [
    'Baddi', 'Bilaspur', 'Chamba', 'Dharamshala', 'Hamirpur', 'Kangra', 'Kullu', 'Manali', 'Mandi',
    'Nahan', 'Nalagarh', 'Palampur', 'Paonta Sahib', 'Parwanoo', 'Shimla', 'Solan', 'Sundernagar',
    'Una',
  ],
  // Punjab
  '03': [
    'Abohar', 'Amritsar', 'Barnala', 'Batala', 'Bathinda', 'Faridkot', 'Fazilka', 'Firozpur',
    'Gurdaspur', 'Hoshiarpur', 'Jalandhar', 'Kapurthala', 'Khanna', 'Ludhiana', 'Malerkotla',
    'Mansa', 'Moga', 'Mohali', 'Muktsar', 'Nabha', 'Pathankot', 'Patiala', 'Phagwara', 'Rajpura',
    'Ropar', 'Sangrur', 'Sunam', 'Zirakpur',
  ],
  // Chandigarh
  '04': ['Chandigarh', 'Manimajra'],
  // Uttarakhand
  '05': [
    'Almora', 'Bageshwar', 'Chamoli', 'Champawat', 'Dehradun', 'Haldwani', 'Haridwar', 'Kashipur',
    'Kotdwar', 'Mussoorie', 'Nainital', 'Pauri', 'Pithoragarh', 'Rishikesh', 'Roorkee', 'Rudrapur',
    'Sitarganj', 'Tehri', 'Vikasnagar',
  ],
  // Haryana
  '06': [
    'Ambala', 'Bahadurgarh', 'Bhiwani', 'Charkhi Dadri', 'Faridabad', 'Fatehabad', 'Gohana',
    'Gurugram', 'Hansi', 'Hisar', 'Jhajjar', 'Jind', 'Kaithal', 'Karnal', 'Kurukshetra', 'Manesar',
    'Narnaul', 'Narwana', 'Palwal', 'Panchkula', 'Panipat', 'Rewari', 'Rohtak', 'Sirsa', 'Sonipat',
    'Thanesar', 'Tohana', 'Yamunanagar',
  ],
  // Delhi
  '07': [
    'Delhi', 'Dwarka', 'Karol Bagh', 'Narela', 'Nehru Place', 'New Delhi', 'Okhla', 'Pitampura',
    'Rohini', 'Saket', 'Shahdara',
  ],
  // Rajasthan
  '08': [
    'Ajmer', 'Alwar', 'Banswara', 'Baran', 'Barmer', 'Beawar', 'Bharatpur', 'Bhilwara', 'Bhiwadi',
    'Bikaner', 'Bundi', 'Chittorgarh', 'Churu', 'Dausa', 'Dholpur', 'Dungarpur', 'Fatehpur',
    'Gangapur City', 'Hanumangarh', 'Jaipur', 'Jaisalmer', 'Jalore', 'Jhalawar', 'Jhunjhunu',
    'Jodhpur', 'Karauli', 'Kishangarh', 'Kota', 'Makrana', 'Nagaur', 'Nathdwara', 'Pali', 'Phalodi',
    'Pratapgarh', 'Rajsamand', 'Sawai Madhopur', 'Sikar', 'Sirohi', 'Sri Ganganagar', 'Tonk',
    'Udaipur',
  ],
  // Uttar Pradesh
  '09': [
    'Agra', 'Aligarh', 'Amroha', 'Ayodhya', 'Azamgarh', 'Baghpat', 'Bahraich', 'Ballia', 'Banda',
    'Barabanki', 'Bareilly', 'Basti', 'Bijnor', 'Budaun', 'Bulandshahr', 'Chandausi', 'Deoria',
    'Etah', 'Etawah', 'Farrukhabad', 'Fatehpur', 'Firozabad', 'Ghaziabad', 'Ghazipur', 'Gonda',
    'Gorakhpur', 'Greater Noida', 'Hapur', 'Hardoi', 'Hathras', 'Jaunpur', 'Jhansi', 'Kanpur',
    'Kasganj', 'Khurja', 'Lakhimpur', 'Lalitpur', 'Lucknow', 'Mainpuri', 'Mathura', 'Mau', 'Meerut',
    'Mirzapur', 'Modinagar', 'Moradabad', 'Muzaffarnagar', 'Noida', 'Orai', 'Pilibhit', 'Prayagraj',
    'Raebareli', 'Rampur', 'Saharanpur', 'Sambhal', 'Shahjahanpur', 'Shamli', 'Sitapur',
    'Sultanpur', 'Unnao', 'Varanasi',
  ],
  // Bihar
  '10': [
    'Ara', 'Aurangabad', 'Begusarai', 'Bettiah', 'Bhagalpur', 'Bihar Sharif', 'Buxar', 'Chhapra',
    'Darbhanga', 'Dehri', 'Gaya', 'Gopalganj', 'Hajipur', 'Jamalpur', 'Jehanabad', 'Katihar',
    'Kishanganj', 'Madhubani', 'Motihari', 'Munger', 'Muzaffarpur', 'Nawada', 'Patna', 'Purnia',
    'Samastipur', 'Sasaram', 'Sitamarhi', 'Siwan', 'Supaul',
  ],
  // Sikkim
  '11': ['Gangtok', 'Gyalshing', 'Jorethang', 'Mangan', 'Namchi', 'Rangpo', 'Ravangla', 'Singtam', 'Soreng'],
  // Arunachal Pradesh
  '12': [
    'Aalo', 'Bomdila', 'Changlang', 'Itanagar', 'Khonsa', 'Naharlagun', 'Pasighat', 'Roing',
    'Seppa', 'Tawang', 'Tezu', 'Ziro',
  ],
  // Nagaland
  '13': [
    'Chumoukedima', 'Dimapur', 'Kiphire', 'Kohima', 'Mokokchung', 'Mon', 'Phek', 'Tuensang',
    'Wokha', 'Zunheboto',
  ],
  // Manipur
  '14': ['Bishnupur', 'Churachandpur', 'Imphal', 'Kakching', 'Senapati', 'Thoubal', 'Ukhrul'],
  // Mizoram
  '15': ['Aizawl', 'Champhai', 'Kolasib', 'Lawngtlai', 'Lunglei', 'Mamit', 'Saiha', 'Serchhip'],
  // Tripura
  '16': [
    'Agartala', 'Ambassa', 'Belonia', 'Dharmanagar', 'Kailashahar', 'Khowai', 'Sabroom',
    'Teliamura', 'Udaipur',
  ],
  // Meghalaya
  '17': [
    'Baghmara', 'Cherrapunji', 'Jowai', 'Nongpoh', 'Nongstoin', 'Resubelpara', 'Shillong', 'Tura',
    'Williamnagar',
  ],
  // Assam
  '18': [
    'Barpeta', 'Bongaigaon', 'Dhubri', 'Dibrugarh', 'Diphu', 'Goalpara', 'Golaghat', 'Guwahati',
    'Hailakandi', 'Jorhat', 'Karimganj', 'Kokrajhar', 'Nagaon', 'Nalbari', 'North Lakhimpur',
    'Sibsagar', 'Silchar', 'Tezpur', 'Tinsukia',
  ],
  // West Bengal
  '19': [
    'Alipurduar', 'Asansol', 'Baharampur', 'Balurghat', 'Bankura', 'Barasat', 'Bardhaman',
    'Basirhat', 'Bidhannagar', 'Bishnupur', 'Bolpur', 'Chandannagar', 'Cooch Behar', 'Darjeeling',
    'Durgapur', 'Habra', 'Haldia', 'Howrah', 'Jalpaiguri', 'Kalyani', 'Kharagpur', 'Kolkata',
    'Krishnanagar', 'Malda', 'Medinipur', 'Nabadwip', 'Purulia', 'Raiganj', 'Rampurhat',
    'Ranaghat', 'Santipur', 'Serampore', 'Siliguri', 'Tamluk',
  ],
  // Jharkhand
  '20': [
    'Bokaro Steel City', 'Chaibasa', 'Chakradharpur', 'Chatra', 'Daltonganj', 'Deoghar', 'Dhanbad',
    'Dumka', 'Giridih', 'Gumla', 'Hazaribagh', 'Jamshedpur', 'Jhumri Telaiya', 'Koderma',
    'Lohardaga', 'Phusro', 'Ramgarh', 'Ranchi', 'Sahibganj', 'Saraikela', 'Simdega',
  ],
  // Odisha
  '21': [
    'Angul', 'Balangir', 'Balasore', 'Bargarh', 'Baripada', 'Berhampur', 'Bhadrak', 'Bhawanipatna',
    'Bhubaneswar', 'Cuttack', 'Dhenkanal', 'Jajpur', 'Jeypore', 'Jharsuguda', 'Kendrapara',
    'Keonjhar', 'Khordha', 'Koraput', 'Paradip', 'Puri', 'Rayagada', 'Rourkela', 'Sambalpur',
    'Sundargarh', 'Talcher',
  ],
  // Chhattisgarh
  '22': [
    'Ambikapur', 'Bhatapara', 'Bhilai', 'Bilaspur', 'Champa', 'Dhamtari', 'Durg', 'Jagdalpur',
    'Janjgir', 'Kanker', 'Kawardha', 'Korba', 'Mahasamund', 'Mungeli', 'Raigarh', 'Raipur',
    'Rajnandgaon',
  ],
  // Madhya Pradesh
  '23': [
    'Balaghat', 'Betul', 'Bhind', 'Bhopal', 'Burhanpur', 'Chhatarpur', 'Chhindwara', 'Damoh',
    'Dewas', 'Dhar', 'Guna', 'Gwalior', 'Indore', 'Itarsi', 'Jabalpur', 'Katni', 'Khandwa',
    'Khargone', 'Mandsaur', 'Mhow', 'Morena', 'Narmadapuram', 'Neemuch', 'Pithampur', 'Ratlam',
    'Rewa', 'Sagar', 'Satna', 'Sehore', 'Seoni', 'Shahdol', 'Shivpuri', 'Singrauli', 'Ujjain',
    'Vidisha',
  ],
  // Gujarat
  '24': [
    'Ahmedabad', 'Amreli', 'Anand', 'Ankleshwar', 'Bharuch', 'Bhavnagar', 'Bhuj', 'Dahod',
    'Gandhidham', 'Gandhinagar', 'Godhra', 'Halol', 'Himatnagar', 'Jamnagar', 'Junagadh', 'Kalol',
    'Khambhat', 'Mehsana', 'Morbi', 'Nadiad', 'Navsari', 'Palanpur', 'Patan', 'Porbandar', 'Rajkot',
    'Sanand', 'Surat', 'Surendranagar', 'Vadodara', 'Valsad', 'Vapi', 'Veraval',
  ],
  // Dadra and Nagar Haveli and Daman and Diu
  '26': ['Amli', 'Dadra', 'Daman', 'Diu', 'Silvassa'],
  // Maharashtra
  '27': [
    'Ahmednagar', 'Akola', 'Amravati', 'Aurangabad', 'Baramati', 'Beed', 'Bhiwandi', 'Boisar',
    'Chandrapur', 'Chiplun', 'Dhule', 'Gondia', 'Ichalkaranji', 'Jalgaon', 'Jalna', 'Kalyan',
    'Kolhapur', 'Latur', 'Malegaon', 'Mumbai', 'Nagpur', 'Nanded', 'Nashik', 'Navi Mumbai',
    'Osmanabad', 'Palghar', 'Panvel', 'Parbhani', 'Pimpri-Chinchwad', 'Pune', 'Ratnagiri', 'Sangli',
    'Satara', 'Shirdi', 'Solapur', 'Thane', 'Ulhasnagar', 'Vasai-Virar', 'Wardha', 'Yavatmal',
  ],
  // Karnataka
  '29': [
    'Ballari', 'Belagavi', 'Bengaluru', 'Bhadravati', 'Bidar', 'Chikkaballapur', 'Chikkamagaluru',
    'Chitradurga', 'Davanagere', 'Dharwad', 'Gadag', 'Hassan', 'Haveri', 'Hosapete', 'Hubballi',
    'Kalaburagi', 'Karwar', 'Kolar', 'Koppal', 'Mandya', 'Mangaluru', 'Mysuru', 'Raichur',
    'Ramanagara', 'Shivamogga', 'Tumakuru', 'Udupi', 'Vijayapura', 'Yadgir',
  ],
  // Goa
  '30': [
    'Bicholim', 'Canacona', 'Curchorem', 'Mapusa', 'Margao', 'Mormugao', 'Panaji', 'Ponda',
    'Porvorim', 'Quepem', 'Sanquelim', 'Valpoi', 'Vasco da Gama',
  ],
  // Lakshadweep
  '31': ['Agatti', 'Amini', 'Andrott', 'Kadmat', 'Kalpeni', 'Kavaratti', 'Minicoy'],
  // Kerala
  '32': [
    'Alappuzha', 'Aluva', 'Angamaly', 'Attingal', 'Chalakudy', 'Changanassery', 'Cherthala',
    'Kalpetta', 'Kannur', 'Kasaragod', 'Kochi', 'Kollam', 'Kottayam', 'Kozhikode', 'Malappuram',
    'Manjeri', 'Nedumangad', 'Neyyattinkara', 'Palakkad', 'Pathanamthitta', 'Perinthalmanna',
    'Ponnani', 'Thalassery', 'Thiruvalla', 'Thiruvananthapuram', 'Thodupuzha', 'Thrissur', 'Tirur',
    'Vatakara',
  ],
  // Tamil Nadu
  '33': [
    'Ambur', 'Arakkonam', 'Ariyalur', 'Avadi', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore',
    'Dharmapuri', 'Dindigul', 'Erode', 'Gudiyatham', 'Hosur', 'Kanchipuram', 'Karaikudi', 'Karur',
    'Kovilpatti', 'Krishnagiri', 'Kumbakonam', 'Madurai', 'Mayiladuthurai', 'Nagapattinam',
    'Nagercoil', 'Namakkal', 'Neyveli', 'Ooty', 'Palani', 'Pollachi', 'Pudukkottai', 'Rajapalayam',
    'Ramanathapuram', 'Salem', 'Sivakasi', 'Sriperumbudur', 'Thanjavur', 'Theni', 'Thoothukudi',
    'Tiruchirappalli', 'Tirunelveli', 'Tirupattur', 'Tiruppur', 'Tiruvallur', 'Tiruvannamalai',
    'Vellore', 'Villupuram', 'Virudhunagar',
  ],
  // Puducherry
  '34': ['Karaikal', 'Mahe', 'Oulgaret', 'Puducherry', 'Villianur', 'Yanam'],
  // Andaman and Nicobar Islands
  '35': ['Car Nicobar', 'Diglipur', 'Mayabunder', 'Port Blair', 'Rangat', 'Swaraj Dweep'],
  // Telangana
  '36': [
    'Adilabad', 'Bhongir', 'Hyderabad', 'Jagtial', 'Kamareddy', 'Karimnagar', 'Khammam',
    'Kothagudem', 'Mahbubnagar', 'Mancherial', 'Medak', 'Miryalaguda', 'Nalgonda', 'Nirmal',
    'Nizamabad', 'Peddapalli', 'Ramagundam', 'Sangareddy', 'Secunderabad', 'Siddipet', 'Suryapet',
    'Vikarabad', 'Wanaparthy', 'Warangal', 'Zaheerabad',
  ],
  // Andhra Pradesh
  '37': [
    'Adoni', 'Amaravati', 'Anakapalle', 'Anantapur', 'Bhimavaram', 'Chilakaluripet', 'Chirala',
    'Chittoor', 'Dharmavaram', 'Eluru', 'Gudivada', 'Guntakal', 'Guntur', 'Hindupur', 'Kadapa',
    'Kakinada', 'Kurnool', 'Machilipatnam', 'Madanapalle', 'Nandyal', 'Narasaraopet', 'Nellore',
    'Ongole', 'Proddatur', 'Rajahmundry', 'Srikakulam', 'Tadepalligudem', 'Tenali', 'Tirupati',
    'Vijayawada', 'Visakhapatnam', 'Vizianagaram',
  ],
  // Ladakh
  '38': ['Diskit', 'Kargil', 'Khaltse', 'Leh', 'Nubra', 'Zanskar'],
};

/** Cities of one state, or an empty list when no state has been chosen yet. */
export function citiesForState(stateCode?: string): string[] {
  if (!stateCode) return [];
  return CITIES_BY_STATE[stateCode] ?? [];
}

let flat: { name: string; stateCode: string }[] | null = null;

/** Every city with the state it belongs to — the fallback list before a state is picked. */
export function allCities(): { name: string; stateCode: string }[] {
  if (!flat) {
    flat = INDIAN_STATES.flatMap((s) =>
      citiesForState(s.code).map((name) => ({ name, stateCode: s.code })),
    ).sort((a, b) => a.name.localeCompare(b.name));
  }
  return flat;
}
