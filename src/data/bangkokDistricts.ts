export interface BangkokDistrict {
  id: string;
  nameTh: string;
  nameEn: string;
  center: { lat: number; lng: number };
  playableZoneId:
    | "phra-nakhon"
    | "samphanthawong"
    | "pathum-wan"
    | "sathorn-silom"
    | "ari-chatuchak"
    | "khlong-san"
    | "outer-bangkok";
}

export const bangkokDistricts: BangkokDistrict[] = [
  { id: "phra-nakhon", nameTh: "พระนคร", nameEn: "Phra Nakhon", center: { lat: 13.7566, lng: 100.4982 }, playableZoneId: "phra-nakhon" },
  { id: "dusit", nameTh: "ดุสิต", nameEn: "Dusit", center: { lat: 13.7768, lng: 100.5206 }, playableZoneId: "phra-nakhon" },
  { id: "nong-chok", nameTh: "หนองจอก", nameEn: "Nong Chok", center: { lat: 13.8554, lng: 100.8628 }, playableZoneId: "outer-bangkok" },
  { id: "bang-rak", nameTh: "บางรัก", nameEn: "Bang Rak", center: { lat: 13.7305, lng: 100.5230 }, playableZoneId: "sathorn-silom" },
  { id: "bang-khen", nameTh: "บางเขน", nameEn: "Bang Khen", center: { lat: 13.8736, lng: 100.5965 }, playableZoneId: "outer-bangkok" },
  { id: "bang-kapi", nameTh: "บางกะปิ", nameEn: "Bang Kapi", center: { lat: 13.7658, lng: 100.6478 }, playableZoneId: "outer-bangkok" },
  { id: "pathum-wan", nameTh: "ปทุมวัน", nameEn: "Pathum Wan", center: { lat: 13.7449, lng: 100.5329 }, playableZoneId: "pathum-wan" },
  { id: "pom-prap-sattru-phai", nameTh: "ป้อมปราบศัตรูพ่าย", nameEn: "Pom Prap Sattru Phai", center: { lat: 13.7538, lng: 100.5136 }, playableZoneId: "samphanthawong" },
  { id: "phra-khanong", nameTh: "พระโขนง", nameEn: "Phra Khanong", center: { lat: 13.7022, lng: 100.6019 }, playableZoneId: "outer-bangkok" },
  { id: "min-buri", nameTh: "มีนบุรี", nameEn: "Min Buri", center: { lat: 13.8130, lng: 100.7312 }, playableZoneId: "outer-bangkok" },
  { id: "lat-krabang", nameTh: "ลาดกระบัง", nameEn: "Lat Krabang", center: { lat: 13.7223, lng: 100.7852 }, playableZoneId: "outer-bangkok" },
  { id: "yan-nawa", nameTh: "ยานนาวา", nameEn: "Yan Nawa", center: { lat: 13.6969, lng: 100.5431 }, playableZoneId: "sathorn-silom" },
  { id: "samphanthawong", nameTh: "สัมพันธวงศ์", nameEn: "Samphanthawong", center: { lat: 13.7399, lng: 100.5090 }, playableZoneId: "samphanthawong" },
  { id: "phaya-thai", nameTh: "พญาไท", nameEn: "Phaya Thai", center: { lat: 13.7801, lng: 100.5428 }, playableZoneId: "ari-chatuchak" },
  { id: "thon-buri", nameTh: "ธนบุรี", nameEn: "Thon Buri", center: { lat: 13.7257, lng: 100.4850 }, playableZoneId: "khlong-san" },
  { id: "bangkok-yai", nameTh: "บางกอกใหญ่", nameEn: "Bangkok Yai", center: { lat: 13.7353, lng: 100.4754 }, playableZoneId: "khlong-san" },
  { id: "huai-khwang", nameTh: "ห้วยขวาง", nameEn: "Huai Khwang", center: { lat: 13.7767, lng: 100.5790 }, playableZoneId: "outer-bangkok" },
  { id: "khlong-san", nameTh: "คลองสาน", nameEn: "Khlong San", center: { lat: 13.7266, lng: 100.5099 }, playableZoneId: "khlong-san" },
  { id: "taling-chan", nameTh: "ตลิ่งชัน", nameEn: "Taling Chan", center: { lat: 13.7765, lng: 100.4568 }, playableZoneId: "outer-bangkok" },
  { id: "bangkok-noi", nameTh: "บางกอกน้อย", nameEn: "Bangkok Noi", center: { lat: 13.7661, lng: 100.4757 }, playableZoneId: "khlong-san" },
  { id: "bang-khun-thian", nameTh: "บางขุนเทียน", nameEn: "Bang Khun Thian", center: { lat: 13.5940, lng: 100.4268 }, playableZoneId: "outer-bangkok" },
  { id: "phasi-charoen", nameTh: "ภาษีเจริญ", nameEn: "Phasi Charoen", center: { lat: 13.7147, lng: 100.4372 }, playableZoneId: "outer-bangkok" },
  { id: "nong-khaem", nameTh: "หนองแขม", nameEn: "Nong Khaem", center: { lat: 13.7047, lng: 100.3488 }, playableZoneId: "outer-bangkok" },
  { id: "rat-burana", nameTh: "ราษฎร์บูรณะ", nameEn: "Rat Burana", center: { lat: 13.6824, lng: 100.5051 }, playableZoneId: "outer-bangkok" },
  { id: "bang-phlat", nameTh: "บางพลัด", nameEn: "Bang Phlat", center: { lat: 13.7930, lng: 100.5057 }, playableZoneId: "khlong-san" },
  { id: "din-daeng", nameTh: "ดินแดง", nameEn: "Din Daeng", center: { lat: 13.7697, lng: 100.5527 }, playableZoneId: "ari-chatuchak" },
  { id: "bueng-kum", nameTh: "บึงกุ่ม", nameEn: "Bueng Kum", center: { lat: 13.7852, lng: 100.6691 }, playableZoneId: "outer-bangkok" },
  { id: "sathon", nameTh: "สาทร", nameEn: "Sathon", center: { lat: 13.7212, lng: 100.5261 }, playableZoneId: "sathorn-silom" },
  { id: "bang-sue", nameTh: "บางซื่อ", nameEn: "Bang Sue", center: { lat: 13.8035, lng: 100.5375 }, playableZoneId: "ari-chatuchak" },
  { id: "chatuchak", nameTh: "จตุจักร", nameEn: "Chatuchak", center: { lat: 13.8166, lng: 100.5610 }, playableZoneId: "ari-chatuchak" },
  { id: "bang-kho-laem", nameTh: "บางคอแหลม", nameEn: "Bang Kho Laem", center: { lat: 13.6931, lng: 100.5020 }, playableZoneId: "sathorn-silom" },
  { id: "prawet", nameTh: "ประเวศ", nameEn: "Prawet", center: { lat: 13.7060, lng: 100.6945 }, playableZoneId: "outer-bangkok" },
  { id: "khlong-toei", nameTh: "คลองเตย", nameEn: "Khlong Toei", center: { lat: 13.7074, lng: 100.5847 }, playableZoneId: "sathorn-silom" },
  { id: "suan-luang", nameTh: "สวนหลวง", nameEn: "Suan Luang", center: { lat: 13.7303, lng: 100.6514 }, playableZoneId: "outer-bangkok" },
  { id: "chom-thong", nameTh: "จอมทอง", nameEn: "Chom Thong", center: { lat: 13.6777, lng: 100.4841 }, playableZoneId: "outer-bangkok" },
  { id: "don-mueang", nameTh: "ดอนเมือง", nameEn: "Don Mueang", center: { lat: 13.9136, lng: 100.5894 }, playableZoneId: "outer-bangkok" },
  { id: "ratchathewi", nameTh: "ราชเทวี", nameEn: "Ratchathewi", center: { lat: 13.7590, lng: 100.5362 }, playableZoneId: "pathum-wan" },
  { id: "lat-phrao", nameTh: "ลาดพร้าว", nameEn: "Lat Phrao", center: { lat: 13.8066, lng: 100.6072 }, playableZoneId: "outer-bangkok" },
  { id: "watthana", nameTh: "วัฒนา", nameEn: "Watthana", center: { lat: 13.7306, lng: 100.5857 }, playableZoneId: "pathum-wan" },
  { id: "bang-khae", nameTh: "บางแค", nameEn: "Bang Khae", center: { lat: 13.6961, lng: 100.4094 }, playableZoneId: "outer-bangkok" },
  { id: "lak-si", nameTh: "หลักสี่", nameEn: "Lak Si", center: { lat: 13.8877, lng: 100.5793 }, playableZoneId: "outer-bangkok" },
  { id: "sai-mai", nameTh: "สายไหม", nameEn: "Sai Mai", center: { lat: 13.9190, lng: 100.6540 }, playableZoneId: "outer-bangkok" },
  { id: "khan-na-yao", nameTh: "คันนายาว", nameEn: "Khan Na Yao", center: { lat: 13.8261, lng: 100.6793 }, playableZoneId: "outer-bangkok" },
  { id: "saphan-sung", nameTh: "สะพานสูง", nameEn: "Saphan Sung", center: { lat: 13.7686, lng: 100.6854 }, playableZoneId: "outer-bangkok" },
  { id: "wang-thonglang", nameTh: "วังทองหลาง", nameEn: "Wang Thonglang", center: { lat: 13.7855, lng: 100.6116 }, playableZoneId: "outer-bangkok" },
  { id: "khlong-sam-wa", nameTh: "คลองสามวา", nameEn: "Khlong Sam Wa", center: { lat: 13.8591, lng: 100.7048 }, playableZoneId: "outer-bangkok" },
  { id: "bang-na", nameTh: "บางนา", nameEn: "Bang Na", center: { lat: 13.6676, lng: 100.6070 }, playableZoneId: "outer-bangkok" },
  { id: "thawi-watthana", nameTh: "ทวีวัฒนา", nameEn: "Thawi Watthana", center: { lat: 13.7878, lng: 100.3638 }, playableZoneId: "outer-bangkok" },
  { id: "thung-khru", nameTh: "ทุ่งครุ", nameEn: "Thung Khru", center: { lat: 13.6473, lng: 100.5090 }, playableZoneId: "outer-bangkok" },
  { id: "bang-bon", nameTh: "บางบอน", nameEn: "Bang Bon", center: { lat: 13.6592, lng: 100.3991 }, playableZoneId: "outer-bangkok" },
];

export function getDistrictById(id: string): BangkokDistrict | undefined {
  return bangkokDistricts.find((district) => district.id === id);
}

export function findDistrictByName(name: string): BangkokDistrict | undefined {
  const normalized = name.trim().toLowerCase();
  return bangkokDistricts.find(
    (district) => district.nameEn.toLowerCase() === normalized || district.nameTh === name || district.id === normalized,
  );
}
