import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Award,
  BookOpen,
  Building2,
  ExternalLink,
  GraduationCap,
  Search,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import "../home-featured-researchers.css";

// Local portraits used by the researcher directory.
import tranMinhTrietImg from "@/assets/researchers/tran-minh-triet.jpg";
import haThiThanhHuongImg from "@/assets/researchers/ha-thi-thanh-huong.jpg";
import leHoangSonImg from "@/assets/researchers/le-hoang-son.jpg";
import nguyenXuanPhongImg from "@/assets/researchers/nguyen-xuan-phong.jpg";
import buiHaiHungImg from "@/assets/researchers/bui-hai-hung.jpg";
import trinhVanChienImg from "@/assets/researchers/trinh-van-chien.jpg";
import huynhThiThanhBinhImg from "@/assets/researchers/huynh-thi-thanh-binh.jpg";
import phamHuyHieuImg from "@/assets/researchers/pham-huy-hieu.jpg";

export interface VietnameseResearcher {
  id: string;
  name: string;
  academicTitle: string;
  academicTitleEn: string;
  institution: string;
  institutionEn: string;
  role: string;
  roleEn: string;
  category: "it-ai" | "young-researcher" | "top-ranked" | "data-security";
  specialtyTag: string;
  specialtyTagEn: string;
  avatarUrl: string;
  quote: string;
  quoteEn: string;
  summary: string;
  summaryEn: string;
  topics: string[];
  metrics: {
    publications: string;
    citations: string;
    impactValue: string;
    impactLabel: string;
    impactLabelEn: string;
  };
  representativeWorks: {
    article: string;
    year: number;
    venue: string;
  }[];
  awards: string[];
  awardsEn: string[];
  searchQuery: string;
}

export const VIETNAMESE_RESEARCHERS: VietnameseResearcher[] = [
  {
    id: "tran-minh-triet",
    name: "Trần Minh Triết",
    academicTitle: "PGS. TS. Trần Minh Triết",
    academicTitleEn: "Assoc. Prof. Dr. Tran Minh Triet",
    institution: "Trường ĐH Khoa học Tự nhiên · ĐHQG-HCM",
    institutionEn: "VNUHCM - University of Science",
    role: "Phó Hiệu trưởng · Trưởng PTN Trí tuệ Nhân tạo (AILab)",
    roleEn: "Vice President · Head of Artificial Intelligence Lab",
    category: "it-ai",
    specialtyTag: "Thị giác máy tính & AI",
    specialtyTagEn: "Computer Vision & AI",
    avatarUrl: tranMinhTrietImg,
    quote: "Nghiên cứu học sâu cho thị giác máy tính, truy vấn video quy mô lớn và ứng dụng chẩn đoán y tế thông minh.",
    quoteEn: "Pioneering deep learning solutions for computer vision, large-scale video retrieval, and intelligent medical systems.",
    summary: "Nhà khoa học đầu ngành về xử lý hình ảnh và đa phương tiện tại Việt Nam. Ông đã công bố hơn 160 bài báo trên các tạp chí và hội nghị uy tín quốc tế, đồng thời lãnh đạo nhiều dự án AI trọng điểm phục vụ cộng đồng và an sinh xã hội.",
    summaryEn: "Leading scholar in image processing and multimedia in Vietnam with over 160 international publications in prestigious venues. He leads key national AI initiatives serving healthcare and smart city development.",
    topics: ["Computer Vision", "Deep Learning", "Video Retrieval", "Cybersecurity"],
    metrics: {
      publications: "160+",
      citations: "3,500+",
      impactValue: "24",
      impactLabel: "H-Index",
      impactLabelEn: "H-Index",
    },
    representativeWorks: [
      { article: "Lifelog Retrieval and Interactive Visual Search", year: 2024, venue: "ACM Multimedia / LSC" },
      { article: "Deep Feature Learning for Medical Image Segmentation", year: 2024, venue: "IEEE Access" },
      { article: "Automated Traffic Monitoring and Vehicle Classification", year: 2023, venue: "Expert Systems with Applications" },
    ],
    awards: [
      "Huân chương Lao động hạng Ba (Chủ tịch nước trao tặng)",
      "Bằng khen Thủ tướng Chính phủ vì thành tích KHCN xuất sắc",
      "Gương mặt tiêu biểu Đại học Quốc gia TP.HCM",
    ],
    awardsEn: [
      "Third-class Labor Order by the President of Vietnam",
      "Prime Minister's Certificate of Merit for Science & Tech",
      "VNUHCM Distinguished Scholar of the Decade",
    ],
    searchQuery: "Tran Minh Triet",
  },
  {
    id: "ha-thi-thanh-huong",
    name: "Hà Thị Thanh Hương",
    academicTitle: "TS. Hà Thị Thanh Hương",
    academicTitleEn: "Dr. Ha Thi Thanh Huong",
    institution: "Trường ĐH Quốc tế · ĐHQG-HCM",
    institutionEn: "International University, VNU-HCM",
    role: "Trưởng Bộ môn Kỹ thuật Mô & Y học Tái tạo",
    roleEn: "Chair of Tissue Engineering & Regenerative Medicine",
    category: "young-researcher",
    specialtyTag: "Quả Cầu Vàng 2023 · Top 100 Châu Á",
    specialtyTagEn: "Golden Globe 2023 · Asian Scientist 100",
    avatarUrl: haThiThanhHuongImg,
    quote: "Ứng dụng trí tuệ nhân tạo và phân tích sóng não MRI để phát hiện sớm bệnh suy giảm trí nhớ Alzheimer với chi phí thấp.",
    quoteEn: "Pioneering AI-driven brainwave analysis to detect early-stage Alzheimer's disease affordably in healthcare systems.",
    summary: "Tiến sĩ Đại học Stanford (Hoa Kỳ), nhà khoa học trẻ tiêu biểu nhận Giải thưởng Quả Cầu Vàng 2023 và được vinh danh trong danh sách Top 100 Nhà khoa học Châu Á (Asian Scientist 100). Cô phát triển phần mềm BrainCare ứng dụng học máy chẩn đoán sớm suy giảm nhận thức.",
    summaryEn: "Stanford University PhD, recipient of the prestigious Golden Globe Science & Tech Award 2023 and named in Asian Scientist 100. She develops BrainCare software utilizing machine learning for early neurodegenerative disorder detection.",
    topics: ["BrainWave Analysis", "Medical AI", "Alzheimer Biomarkers", "Biomedical Data"],
    metrics: {
      publications: "45+",
      citations: "950+",
      impactValue: "Stanford",
      impactLabel: "Tiến sĩ",
      impactLabelEn: "PhD",
    },
    representativeWorks: [
      { article: "Brain-computer interface for early cognitive decline detection", year: 2024, venue: "IEEE Trans. Neural Systems" },
      { article: "Machine learning on multi-channel EEG signals for mental stress analysis", year: 2023, venue: "Computers in Biology and Medicine" },
      { article: "Software automated diagnosis for neurodegenerative biomarkers", year: 2023, venue: "Biomedical Signal Processing" },
    ],
    awards: [
      "Giải thưởng Quả Cầu Vàng Khoa học Công nghệ 2023",
      "Học bổng L'Oréal - UNESCO Vì sự phát triển phụ nữ trong khoa học",
      "Top 100 Nhà khoa học tiêu biểu Châu Á (Asian Scientist 100)",
    ],
    awardsEn: [
      "Golden Globe Science & Technology Award 2023",
      "L'Oréal - UNESCO For Women in Science Fellowship",
      "Asian Scientist 100 Honoree",
    ],
    searchQuery: "Ha Thi Thanh Huong",
  },
  {
    id: "le-hoang-son",
    name: "Lê Hoàng Sơn",
    academicTitle: "PGS. TS. Lê Hoàng Sơn",
    academicTitleEn: "Assoc. Prof. Dr. Le Hoang Son",
    institution: "Viện Công nghệ Thông tin · ĐHQG Hà Nội",
    institutionEn: "Information Technology Institute, VNU Hanoi",
    role: "Trưởng phòng Khoa học Dữ liệu · Viện CNTT",
    roleEn: "Head of Data Science Department",
    category: "top-ranked",
    specialtyTag: "Top 1% Thế giới (Stanford)",
    specialtyTagEn: "Top 1% Global Scientist (Stanford)",
    avatarUrl: leHoangSonImg,
    quote: "Phát triển các thuật toán phân cụm mờ và mạng nơ-ron học sâu cho các hệ thống hỗ trợ quyết định không gian - thời gian phức tạp.",
    quoteEn: "Developing advanced fuzzy clustering algorithms and deep spatio-temporal neural networks for high-impact decision support.",
    summary: "Nhiều năm liên tiếp nằm trong bảng xếp hạng các nhà khoa học có tầm ảnh hưởng lớn nhất thế giới của Đại học Stanford (Top 10.000 toàn cầu). Ông đã công bố hơn 220 bài báo ISI/Scopus với chỉ số H-index 48 và hơn 11.000 lượt trích dẫn.",
    summaryEn: "Consistently ranked among Stanford University's Top 1% most influential scientists globally. With over 220 ISI/Scopus publications, an H-index of 48, and 11,000+ citations, he leads research in computational intelligence and fuzzy decision systems.",
    topics: ["Fuzzy Clustering", "Decision Support", "Spatio-Temporal Mining", "Deep Neural Nets"],
    metrics: {
      publications: "220+",
      citations: "11,000+",
      impactValue: "48",
      impactLabel: "H-Index",
      impactLabelEn: "H-Index",
    },
    representativeWorks: [
      { article: "Novel fuzzy clustering algorithms for high-dimensional spatial data", year: 2024, venue: "IEEE Trans. Fuzzy Systems" },
      { article: "Hybrid deep learning framework for environmental disaster forecasting", year: 2023, venue: "Expert Systems with Applications" },
      { article: "Multi-criteria spatial decision making with fuzzy sets", year: 2023, venue: "Information Sciences" },
    ],
    awards: [
      "Top 1% Nhà khoa học có tầm ảnh hưởng nhất thế giới (Stanford/Elsevier)",
      "Giải thưởng Công trình Khoa học Xuất sắc ĐHQG Hà Nội",
      "Gương mặt tiêu biểu Khoa học & Công nghệ Việt Nam",
    ],
    awardsEn: [
      "World's Top 1% Influential Scientists (Stanford / Elsevier ranking)",
      "VNU Hanoi Outstanding Scientific Achievement Award",
      "Vietnam Science & Technology Distinguished Honor",
    ],
    searchQuery: "Le Hoang Son",
  },
  {
    id: "nguyen-xuan-phong",
    name: "Nguyễn Xuân Phong",
    academicTitle: "TS. Nguyễn Xuân Phong",
    academicTitleEn: "Dr. Nguyen Xuan Phong",
    institution: "FPT Software & Viện Mila (Canada)",
    institutionEn: "FPT Software & Mila AI Institute",
    role: "Giám đốc Trí tuệ Nhân tạo (Chief AI Officer)",
    roleEn: "Chief AI Officer · Former Mila AI Fellow",
    category: "young-researcher",
    specialtyTag: "Chief AI Officer · Cựu Mila Scholar",
    specialtyTagEn: "Chief AI Officer · Former Mila Fellow",
    avatarUrl: nguyenXuanPhongImg,
    quote: "Đưa các mô hình Generative AI và học tăng cường vào giải quyết các bài toán sản xuất, năng suất và tự động hóa quy mô lớn.",
    quoteEn: "Translating Generative AI and reinforcement learning into scalable industrial productivity and autonomous enterprise workflows.",
    summary: "Tiến sĩ Đại học Tokyo (Nhật Bản), cựu nghiên cứu viên Viện AI Mila (Canada) dưới sự hướng dẫn của GS. Yoshua Bengio (Turing Award). Ông là đồng tác giả nhiều công trình tại NeurIPS, ICML và đóng vai trò nòng cốt định hình chiến lược AI quốc tế của Việt Nam.",
    summaryEn: "PhD from the University of Tokyo, former research fellow at Mila AI Institute under Turing Award laureate Yoshua Bengio. Co-author of top-tier NeurIPS and ICML publications, he drives Vietnam's enterprise AI innovation globally.",
    topics: ["Generative AI", "LLM Reasoning", "Reinforcement Learning", "Enterprise AI"],
    metrics: {
      publications: "35+",
      citations: "1,200+",
      impactValue: "Tokyo",
      impactLabel: "Tiến sĩ",
      impactLabelEn: "PhD",
    },
    representativeWorks: [
      { article: "Sample-efficient reinforcement learning for complex discrete scheduling", year: 2024, venue: "NeurIPS / Machine Learning" },
      { article: "Domain-specific Large Language Model fine-tuning for enterprise applications", year: 2023, venue: "IEEE Access" },
      { article: "Deep generative representations for automated code synthesis", year: 2023, venue: "ICLR Workshop" },
    ],
    awards: [
      "Học bổng Tiến sĩ Chính phủ Nhật Bản (MEXT Fellowship)",
      "Nghiên cứu viên danh dự Viện AI Mila (Canada)",
      "Lãnh đạo AI Trẻ tiêu biểu Việt Nam",
    ],
    awardsEn: [
      "Japanese Government MEXT Fellowship",
      "Mila AI Institute Research Fellow",
      "Vietnam AI Leadership Honor",
    ],
    searchQuery: "Nguyen Xuan Phong",
  },
  {
    id: "bui-hai-hung",
    name: "Bùi Hải Hưng",
    academicTitle: "TS. Bùi Hải Hưng",
    academicTitleEn: "Dr. Bui Hai Hung",
    institution: "Sáng lập VinAI · Cựu Google DeepMind",
    institutionEn: "Founder VinAI · Ex-Google DeepMind",
    role: "Nhà khoa học máy tính · IEEE Fellow",
    roleEn: "Senior AI Scientist · IEEE Fellow",
    category: "top-ranked",
    specialtyTag: "IEEE Fellow · Cựu DeepMind",
    specialtyTagEn: "IEEE Fellow · Ex-DeepMind",
    avatarUrl: buiHaiHungImg,
    quote: "Xây dựng nền tảng nghiên cứu trí tuệ nhân tạo đẳng cấp thế giới của người Việt, hướng đến học sâu và các mô hình nền tảng.",
    quoteEn: "Architecting world-class AI research institutions founded in Vietnam, focused on deep probabilistic reasoning and foundation models.",
    summary: "Chuyên gia AI người Việt có uy tín học thuật toàn cầu, từng giữ vị trí Senior Staff Research Scientist tại Google DeepMind và SRI International. Ông sáng lập Viện Nghiên cứu AI VinAI, đưa Việt Nam vào danh sách các quốc gia có nhiều công trình đỉnh cao tại NeurIPS, CVPR, ICML.",
    summaryEn: "World-renowned AI research pioneer with tenures as Senior Staff Research Scientist at Google DeepMind and SRI International. As founding director of VinAI, he established Vietnam's presence in top conferences including NeurIPS, CVPR, and ICML.",
    topics: ["Deep Learning", "Probabilistic Inference", "Autonomous Systems", "Foundation Models"],
    metrics: {
      publications: "110+",
      citations: "8,500+",
      impactValue: "IEEE",
      impactLabel: "Fellow",
      impactLabelEn: "Fellow",
    },
    representativeWorks: [
      { article: "Probabilistic models for human intent recognition in dynamic environments", year: 2023, venue: "Artificial Intelligence" },
      { article: "Multi-agent reinforcement learning with distributed policy gradients", year: 2023, venue: "NeurIPS" },
      { article: "Hierarchical Bayesian models for structured vision and language", year: 2022, venue: "CVPR" },
    ],
    awards: [
      "IEEE Fellow danh giá (Cộng đồng Kỹ sư Điện & Điện tử Toàn cầu)",
      "Huy chương Bạc Olympic Toán học Quốc tế (IMO)",
      "Nhân vật truyền cảm hứng Đổi mới sáng tạo & KHCN Việt Nam",
    ],
    awardsEn: [
      "Elected IEEE Fellow for contributions to AI and probabilistic reasoning",
      "Silver Medalist at the International Mathematical Olympiad",
      "Vietnam Science & Innovation Inspiration Award",
    ],
    searchQuery: "Bui Hai Hung",
  },
  {
    id: "trinh-van-chien",
    name: "Trịnh Văn Chiến",
    academicTitle: "TS. Trịnh Văn Chiến",
    academicTitleEn: "Dr. Trinh Van Chien",
    institution: "Trường CNTT&TT · ĐH Bách khoa Hà Nội",
    institutionEn: "SoICT, Hanoi University of Science & Technology",
    role: "Trưởng PTN Mạng không dây thế hệ mới (Next-Gen Wireless)",
    roleEn: "Head of Next-Gen Wireless Communications Lab",
    category: "data-security",
    specialtyTag: "Quả Cầu Vàng 2023 · IEEE ComSoc",
    specialtyTagEn: "Golden Globe 2023 · IEEE ComSoc",
    avatarUrl: trinhVanChienImg,
    quote: "Đột phá trong các giải pháp mảng ăng-ten cực lớn (Massive MIMO) và bề mặt phản xạ thông minh định hình chuẩn mạng 6G.",
    quoteEn: "Pioneering massive MIMO antenna arrays and intelligent reflecting surfaces driving the next frontier of 6G wireless networks.",
    summary: "Tiến sĩ Đại học Linköping (Thụy Điển), một trong những nhà nghiên cứu trẻ xuất sắc nhất khu vực về công nghệ truyền thông không dây băng rộng. Ông đạt Giải thưởng Quả Cầu Vàng 2023 và giải thưởng bài báo xuất sắc từ IEEE Communications Society.",
    summaryEn: "PhD from Linköping University (Sweden), recognized as one of the region's leading young scholars in wireless communications. Recipient of Golden Globe Award 2023 and IEEE Communications Society Best Survey Paper Award.",
    topics: ["6G Communications", "Massive MIMO", "Intelligent Surfaces", "Signal Optimization"],
    metrics: {
      publications: "85+",
      citations: "2,600+",
      impactValue: "22",
      impactLabel: "H-Index",
      impactLabelEn: "H-Index",
    },
    representativeWorks: [
      { article: "Reconfigurable intelligent surfaces for energy-efficient massive MIMO", year: 2024, venue: "IEEE Trans. Wireless Commun." },
      { article: "Deep learning based channel estimation in ultra-dense 6G networks", year: 2023, venue: "IEEE Journal on Selected Areas in Commun." },
      { article: "Robust precoding for cell-free massive MIMO systems", year: 2023, venue: "IEEE Trans. Communications" },
    ],
    awards: [
      "Giải thưởng Quả Cầu Vàng Khoa học Công nghệ 2023",
      "Giải thưởng bài báo xuất sắc nhất từ IEEE Communications Society",
      "Top 10 Gương mặt trẻ Việt Nam triển vọng",
    ],
    awardsEn: [
      "Golden Globe Science & Technology Award 2023",
      "IEEE Communications Society Exemplary Paper Award",
      "Top 10 Promising Young Vietnamese Citizens",
    ],
    searchQuery: "Trinh Van Chien",
  },
  {
    id: "huynh-thi-thanh-binh",
    name: "Huỳnh Thị Thanh Bình",
    academicTitle: "PGS. TS. Huỳnh Thị Thanh Bình",
    academicTitleEn: "Assoc. Prof. Dr. Huynh Thi Thanh Binh",
    institution: "Trường CNTT&TT · ĐH Bách khoa Hà Nội",
    institutionEn: "SoICT, Hanoi University of Science & Technology",
    role: "Phó Hiệu trưởng Trường CNTT&TT · ĐHBK Hà Nội",
    roleEn: "Vice Dean of School of Information & Communication Tech",
    category: "it-ai",
    specialtyTag: "Nhà khoa học nữ CNTT · IEEE Senior",
    specialtyTagEn: "Woman in Tech · IEEE Senior",
    avatarUrl: huynhThiThanhBinhImg,
    quote: "Phát triển các thuật toán tiến hóa đa mục tiêu và tối ưu hóa tính toán biên thông minh trong các bài toán logistics và mạng cảm biến.",
    quoteEn: "Pioneering multi-objective evolutionary computation and intelligent edge optimization for complex logistics and sensor networks.",
    summary: "Nhà khoa học nữ đầu ngành với hơn 130 công trình quốc tế. Bà là thành viên Ban biên tập nhiều tạp chí IEEE danh tiếng, chủ nhiệm nhiều đề tài cấp nhà nước về tối ưu hóa mạng cảm biến không dây và thuật toán tiến hóa memetic.",
    summaryEn: "Leading female computer scientist with over 130 international papers. Serving on editorial boards of prestigious IEEE journals, she directs national key research projects in sensor network deployment and evolutionary algorithms.",
    topics: ["Evolutionary Computing", "Multi-Objective AI", "Sensor Networks", "Resource Allocation"],
    metrics: {
      publications: "130+",
      citations: "2,400+",
      impactValue: "22",
      impactLabel: "H-Index",
      impactLabelEn: "H-Index",
    },
    representativeWorks: [
      { article: "Multi-objective memetic algorithms for wireless sensor node deployment", year: 2024, venue: "IEEE Trans. Evolutionary Computation" },
      { article: "Collaborative edge computing optimization using evolutionary deep learning", year: 2023, venue: "Applied Soft Computing" },
      { article: "Dynamic route optimization in smart logistics systems", year: 2023, venue: "Swarm and Evolutionary Computation" },
    ],
    awards: [
      "Giải thưởng Nhà giáo tiêu biểu toàn quốc",
      "Thành viên cấp cao IEEE (IEEE Senior Member)",
      "Bằng khen của Bộ trưởng Bộ Giáo dục và Đào tạo",
    ],
    awardsEn: [
      "National Exemplary Educator Honor",
      "Elected IEEE Senior Member",
      "Minister of Education & Training Certificate of Merit",
    ],
    searchQuery: "Huynh Thi Thanh Binh",
  },
  {
    id: "pham-huy-hieu",
    name: "Phạm Huy Hiệu",
    academicTitle: "TS. Phạm Huy Hiệu",
    academicTitleEn: "Dr. Pham Huy Hieu",
    institution: "Viện NC Dữ liệu lớn & ĐH VinUni",
    institutionEn: "Big Data Institute & VinUni University",
    role: "Phó GĐ Trung tâm Sức khỏe Thông minh VinUni-Illinois",
    roleEn: "Associate Director · Smart Health Center",
    category: "young-researcher",
    specialtyTag: "Quả Cầu Vàng 2023 · VinDr",
    specialtyTagEn: "Golden Globe 2023 · VinDr",
    avatarUrl: phamHuyHieuImg,
    quote: "Xây dựng các bộ cơ sở dữ liệu y tế mở chuẩn quốc tế và mô hình AI hỗ trợ bác sĩ chẩn đoán chính xác bệnh lý lồng ngực.",
    quoteEn: "Developing benchmark open medical datasets and deep learning models aiding radiologists in high-precision chest pathology diagnosis.",
    summary: "Tiến sĩ Đại học Toulouse (Pháp), Giải thưởng Quả Cầu Vàng 2023. Anh là tác giả chính của VinDr-CXR – bộ dữ liệu X-quang lồng ngực gán nhãn y khoa lớn nhất thế giới được công bố trên Nature Scientific Data và được hàng trăm viện nghiên cứu quốc tế khai thác.",
    summaryEn: "PhD from University of Toulouse (France), recipient of the Golden Globe Award 2023. Lead creator of VinDr-CXR, one of the world's largest open annotated chest X-ray datasets published in Nature Scientific Data.",
    topics: ["Medical Imaging", "Deep Learning", "VinDr Datasets", "Computer-Aided Diagnosis"],
    metrics: {
      publications: "45+",
      citations: "1,500+",
      impactValue: "18",
      impactLabel: "H-Index",
      impactLabelEn: "H-Index",
    },
    representativeWorks: [
      { article: "VinDr-CXR: An open dataset of chest X-rays with radiologist annotations", year: 2022, venue: "Scientific Data (Nature)" },
      { article: "Automated abnormality detection in chest radiography using multi-task deep networks", year: 2023, venue: "IEEE Access" },
      { article: "Federated learning for privacy-preserving medical image analysis across hospitals", year: 2024, venue: "Computers in Biology and Medicine" },
    ],
    awards: [
      "Giải thưởng Quả Cầu Vàng Khoa học Công nghệ 2023",
      "Top 10 Gương mặt trẻ Việt Nam triển vọng",
      "Giải thưởng Nghiên cứu Xuất sắc ĐH VinUni",
    ],
    awardsEn: [
      "Golden Globe Science & Technology Award 2023",
      "Top 10 Promising Young Vietnamese Citizens",
      "VinUni Research Excellence Award",
    ],
    searchQuery: "Pham Huy Hieu",
  },
];

type CategoryKey = "all" | "it-ai" | "young-researcher" | "top-ranked" | "data-security";

export function HomeFeaturedResearchers() {
  const { t, language } = useI18n();
  const isEn = language.startsWith("en");
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [activeModalResearcher, setActiveModalResearcher] = useState<VietnameseResearcher | null>(null);

  const rail = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLUListElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const categories: { key: CategoryKey; titleLabel: string; count: number }[] = [
    { key: "all", titleLabel: t("All researchers"), count: VIETNAMESE_RESEARCHERS.length },
    {
      key: "it-ai",
      titleLabel: t("AI & Computer Science"),
      count: VIETNAMESE_RESEARCHERS.filter((r) => r.category === "it-ai" || r.category === "top-ranked").length,
    },
    {
      key: "young-researcher",
      titleLabel: t("Young Researchers (Golden Globe)"),
      count: VIETNAMESE_RESEARCHERS.filter((r) => r.category === "young-researcher").length,
    },
    {
      key: "top-ranked",
      titleLabel: t("Top 1% Global Scientists"),
      count: VIETNAMESE_RESEARCHERS.filter((r) => r.category === "top-ranked").length,
    },
    {
      key: "data-security",
      titleLabel: t("Data Science & Networks"),
      count: VIETNAMESE_RESEARCHERS.filter(
        (r) => r.category === "data-security" || r.topics.some((tp) => tp.toLowerCase().includes("data") || tp.toLowerCase().includes("security"))
      ).length,
    },
  ];

  const filteredResearchers = VIETNAMESE_RESEARCHERS.filter((researcher) => {
    const matchesCategory =
      selectedCategory === "all" ||
      (selectedCategory === "it-ai" && (researcher.category === "it-ai" || researcher.category === "top-ranked")) ||
      (selectedCategory === "young-researcher" && researcher.category === "young-researcher") ||
      (selectedCategory === "top-ranked" && researcher.category === "top-ranked") ||
      (selectedCategory === "data-security" &&
        (researcher.category === "data-security" ||
          researcher.topics.some((tp) => tp.toLowerCase().includes("data") || tp.toLowerCase().includes("security"))));

    if (!matchesCategory) return false;

    if (!searchFilter.trim()) return true;

    const term = searchFilter.toLowerCase().trim();
    return (
      researcher.name.toLowerCase().includes(term) ||
      researcher.academicTitle.toLowerCase().includes(term) ||
      researcher.institution.toLowerCase().includes(term) ||
      researcher.institutionEn.toLowerCase().includes(term) ||
      researcher.topics.some((top) => top.toLowerCase().includes(term)) ||
      researcher.specialtyTag.toLowerCase().includes(term) ||
      researcher.specialtyTagEn.toLowerCase().includes(term)
    );
  });

  const checkScrollState = () => {
    const el = rail.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useLayoutEffect(() => {
    checkScrollState();
    const el = rail.current;
    if (!el) return;
    el.addEventListener("scroll", checkScrollState, { passive: true });
    window.addEventListener("resize", checkScrollState);
    return () => {
      el.removeEventListener("scroll", checkScrollState);
      window.removeEventListener("resize", checkScrollState);
    };
  }, [filteredResearchers.length]);

  const scrollRail = (direction: -1 | 1) => {
    const el = rail.current;
    if (!el) return;
    const cardWidth = (track.current?.firstElementChild as HTMLElement | null)?.offsetWidth ?? 560;
    const gap = track.current ? parseFloat(getComputedStyle(track.current).columnGap) || 0 : 0;
    el.scrollBy({ left: direction * (cardWidth + gap), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };

  return (
    <section
      id="home-featured-researchers"
      className="home-researchers-section home-width"
      aria-labelledby="home-researchers-heading"
      data-home-reveal
    >
      {/* Header Area */}
      <div className="home-researchers-header" data-home-animate>
        <div className="home-researchers-title-area">
          <p className="home-researchers-eyebrow">{t("Vietnamese Research Spotlight")}</p>
          <h2 id="home-researchers-heading">{t("Prominent Vietnamese Researchers")}</h2>
          <p className="home-researchers-subtitle">
            {t("Explore research interests, academic profiles and published work.")}
          </p>
        </div>
        <Link to="/literature?sort=citations" className="academic-text-link">
          {t("Browse literature")}
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </div>

      {/* Filter Toolbar */}
      <div className="home-researchers-toolbar" data-home-animate>
        <div className="home-researchers-categories" role="group" aria-label={t("Categories")}>
          {categories.map((cat) => {
            const isActive = selectedCategory === cat.key;
            return (
              <button
                key={cat.key}
                type="button"
                aria-pressed={isActive}
                className={`home-researchers-tab ${isActive ? "is-active" : ""}`}
                onClick={() => setSelectedCategory(cat.key)}
              >
                <span>{cat.titleLabel}</span>
                <span className="home-researchers-tab-badge">{cat.count}</span>
              </button>
            );
          })}
        </div>

        <div className="home-researchers-search">
          <Search className="home-researchers-search-icon" aria-hidden="true" />
          <input
            type="search"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder={t("Search researcher or specialty...")}
            aria-label={t("Search researcher or specialty...")}
          />
          {searchFilter ? (
            <button
              type="button"
              className="home-researchers-clear-btn"
              onClick={() => setSearchFilter("")}
              aria-label={t("Clear search filter")}
            >
              <X aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Researcher Cards Viewport */}
      <div className="home-researchers-viewport-wrap" data-home-animate>
        {filteredResearchers.length === 0 ? (
          <div className="home-researchers-empty" role="status">
            <p>{t("No researchers match your search")}</p>
            <button
              type="button"
              className="academic-text-link"
              onClick={() => {
                setSelectedCategory("all");
                setSearchFilter("");
              }}
            >
              {t("Clear search filter")}
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div ref={rail} className="home-researchers-rail-container">
            <ul ref={track} className="home-researchers-rail" aria-label={t("Prominent Vietnamese Researchers")}>
              {filteredResearchers.map((researcher) => {
                const institutionLabel = isEn ? researcher.institutionEn : researcher.institution;
                const quoteLabel = isEn ? researcher.quoteEn : researcher.quote;
                const academicTitleLabel = isEn ? researcher.academicTitleEn : researcher.academicTitle;

                return (
                  <li key={researcher.id} className="home-researcher-item">
                    <article className="home-researcher-card" data-category={researcher.category}>
                      <img className="home-scholar-portrait" src={researcher.avatarUrl} alt="" loading="lazy" width={136} height={164} />
                      <div className="home-scholar-header-info">
                        <h3 className="home-scholar-name">
                          <button type="button" onClick={() => setActiveModalResearcher(researcher)}>{academicTitleLabel}</button>
                        </h3>
                        <p className="home-scholar-institution">{institutionLabel}</p>
                        <p className="home-scholar-focus">{researcher.topics.slice(0, 2).join(" · ")}</p>
                      </div>
                      <p className="home-scholar-quote">{quoteLabel}</p>
                      <div className="home-scholar-card-actions">
                        <button
                          type="button"
                          className="home-scholar-btn-secondary"
                          onClick={() => setActiveModalResearcher(researcher)}
                        >
                          <span>{t("Profile & contributions")}</span>
                          <ArrowRight aria-hidden="true" />
                        </button>
                        <Link
                          to={`/literature?q=${encodeURIComponent(researcher.searchQuery)}`}
                          className="home-scholar-btn-primary"
                        >
                          <span>{t("View papers")}</span>
                          <ArrowUpRight aria-hidden="true" />
                        </Link>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Carousel controls & Counter */}
        {filteredResearchers.length > 0 ? (
          <div className="home-researchers-footer">
            <span className="home-researchers-count">
              {t("{{count}} researchers", { count: filteredResearchers.length })}
            </span>
            <div className="home-researchers-controls" role="group" aria-label={t("Featured researcher controls")}>
              <button
                type="button"
                aria-label={t("Previous researchers")}
                disabled={!canScrollLeft}
                onClick={() => scrollRail(-1)}
              >
                <ArrowLeft aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={t("Next researchers")}
                disabled={!canScrollRight}
                onClick={() => scrollRail(1)}
              >
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Detailed Profile Dialog */}
      <Dialog
        open={Boolean(activeModalResearcher)}
        onOpenChange={(open) => {
          if (!open) setActiveModalResearcher(null);
        }}
      >
        {activeModalResearcher ? (
          <DialogContent
            className="home-researcher-modal-content max-w-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 shadow-2xl"
            overlayClassName="bg-slate-950/70 backdrop-blur-sm"
          >
            <DialogHeader>
              <div className="home-modal-profile-header">
                <div
                  className="home-modal-avatar-box"
                  role="presentation"
                  style={{
                    backgroundImage: `url(${activeModalResearcher.avatarUrl})`,
                  }}
                >
                </div>

                <div className="home-modal-title-box">
                  <div className="home-modal-badge">
                    <Award aria-hidden="true" />
                    <span>
                      {isEn ? activeModalResearcher.specialtyTagEn : activeModalResearcher.specialtyTag}
                    </span>
                  </div>
                  <DialogTitle className="home-modal-name">
                    {isEn ? activeModalResearcher.academicTitleEn : activeModalResearcher.academicTitle}
                  </DialogTitle>
                  <DialogDescription className="home-modal-institution">
                    <Building2 aria-hidden="true" />
                    <span>
                      {isEn ? activeModalResearcher.institutionEn : activeModalResearcher.institution}
                    </span>
                  </DialogDescription>
                  <p className="home-modal-role-subtitle">
                    {isEn ? activeModalResearcher.roleEn : activeModalResearcher.role}
                  </p>
                </div>
              </div>
            </DialogHeader>

            <div className="home-modal-body">
              {/* Bio */}
              <div className="home-modal-section">
                <h4>{t("Academic profile")}</h4>
                <p>{isEn ? activeModalResearcher.summaryEn : activeModalResearcher.summary}</p>
              </div>

              {/* Research Focus */}
              <div className="home-modal-section">
                <h4>{t("Research focus")}</h4>
                <div className="home-modal-topic-pills">
                  {activeModalResearcher.topics.map((tp) => (
                    <span key={tp} className="home-modal-topic-pill">
                      <GraduationCap aria-hidden="true" />
                      {tp}
                    </span>
                  ))}
                </div>
              </div>

              {/* Representative Works */}
              <div className="home-modal-section">
                <h4>{t("Representative works")}</h4>
                <ul className="home-modal-works-list">
                  {activeModalResearcher.representativeWorks.map((work) => (
                    <li key={work.article} className="home-modal-work-item">
                      <div className="home-modal-work-icon">
                        <BookOpen aria-hidden="true" />
                      </div>
                      <div className="home-modal-work-content">
                        <strong>{work.article}</strong>
                        <div className="home-modal-work-meta">
                          <span>{work.venue}</span>
                          <span aria-hidden="true">·</span>
                          <span>{work.year}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Awards & Honors */}
              <div className="home-modal-section">
                <h4>{t("Notable awards & honors")}</h4>
                <ul className="home-modal-awards-list">
                  {(isEn ? activeModalResearcher.awardsEn : activeModalResearcher.awards).map((award) => (
                    <li key={award} className="home-modal-award-item">
                      <Award aria-hidden="true" />
                      <span>{award}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="home-modal-footer">
              <Link
                to={`/literature?q=${encodeURIComponent(activeModalResearcher.searchQuery)}`}
                className="academic-button home-modal-search-btn"
                onClick={() => setActiveModalResearcher(null)}
              >
                <span>{t("Search their papers in LumiGap")}</span>
                <ExternalLink aria-hidden="true" />
              </Link>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </section>
  );
}
