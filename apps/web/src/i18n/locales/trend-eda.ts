// Exploratory analysis of a topic's trend (features/trends/components/trend-eda-section.tsx).
// English is the key; Vietnamese is the translation.
export const trendEdaViStrings = {
  "Exploratory analysis": "Phân tích khám phá",
  "The trend is read in five steps: check the data, describe it, draw it, look for anomalous years, then conclude with a statistical test.":
    "Xu hướng được đọc qua năm bước: kiểm tra dữ liệu, mô tả bằng thống kê, trực quan hoá, tìm năm bất thường, rồi kết luận bằng kiểm định thống kê.",
  "Conclusion": "Kết luận",
  "Read with care: {{years}} stand out from the trend line (step 4). The conclusion is the same with or without this note.":
    "Lưu ý khi đọc: năm {{years}} lệch hẳn khỏi đường xu hướng (bước 4). Kết luận không đổi dù có hay không có lưu ý này.",
  "Understand and check the data": "Hiểu và kiểm tra dữ liệu",
  "Data source": "Nguồn dữ liệu",
  "Local corpus": "Kho dữ liệu cục bộ",
  "Years left out": "Năm bị loại",
  "None": "Không có",
  "still running": "chưa kết thúc",
  "no papers in the reference population": "tập tham chiếu không có bài",
  "Years without a paper of the topic": "Năm chủ đề không có bài nào",
  "Information Technology scope": "Phạm vi Công nghệ thông tin",
  "Descriptive statistics": "Thống kê mô tả",
  "Skewness and kurtosis are shown for description only: on a series this short they vary a lot, and they do not take part in the conclusion.":
    "Độ lệch và độ nhọn chỉ để mô tả: với chuỗi ngắn như thế này chúng dao động mạnh và không tham gia vào kết luận.",
  "No complete year to describe.": "Chưa có năm hoàn chỉnh nào để mô tả.",
  "No complete year to draw.": "Chưa có năm hoàn chỉnh nào để vẽ.",
  "Visualise the series": "Trực quan hoá chuỗi dữ liệu",
  "Share over time with its trend line": "Thị phần theo năm và đường xu hướng",
  "Dashed: Theil–Sen line. Shaded: the recent years the plateau check looks at. Red: anomalous years.":
    "Nét đứt: đường Theil–Sen. Vùng tô: các năm gần đây dùng để xét bão hoà. Đỏ: năm bất thường.",
  "Share of papers": "Thị phần",
  "Trend line": "Đường xu hướng",
  "Anomalous year": "Năm bất thường",
  "Residuals: share minus trend line": "Phần dư: thị phần trừ đường xu hướng",
  "Percentage points. A bar far from the others is an anomalous year.": "Đơn vị điểm phần trăm. Cột cách xa các cột khác là năm bất thường.",
  "Residual": "Phần dư",
  "At least 2 years are needed to fit a line.": "Cần ít nhất 2 năm để dựng đường xu hướng.",
  "Distribution of the yearly share": "Phân phối của thị phần theo năm",
  "Box: first quartile, median, third quartile. Whiskers: minimum and maximum. Dots: each year.":
    "Hộp: tứ phân vị thứ nhất, trung vị, tứ phân vị thứ ba. Râu: nhỏ nhất và lớn nhất. Chấm: từng năm.",
  "Anomalous years": "Năm bất thường",
  "No year stands out from the trend line.": "Không có năm nào lệch hẳn khỏi đường xu hướng.",
  "share {{share}}%, {{residual}} percentage points from the trend line (score {{score}}).":
    "thị phần {{share}}%, cách đường xu hướng {{residual}} điểm phần trăm (điểm {{score}}).",
  "A year is anomalous when its residual lies more than 2.5 median absolute deviations from the median residual. Anomalous years are a caution when reading the conclusion; they never change it.":
    "Một năm là bất thường khi phần dư của nó cách trung vị phần dư hơn 2,5 lần độ lệch tuyệt đối trung vị (MAD). Năm bất thường là lưu ý khi đọc kết luận, không bao giờ làm đổi kết luận.",
  "Recent change of the share, per year": "Thay đổi thị phần gần đây, mỗi năm",
  "Recent share compared with its peak": "Thị phần gần đây so với mức đỉnh",
  "Mean": "Trung bình",
  "Median": "Trung vị",
  "First and third quartile": "Tứ phân vị thứ nhất và thứ ba",
  "Minimum and maximum": "Nhỏ nhất và lớn nhất",
  "Range": "Khoảng biến thiên",
  "Variance": "Phương sai",
  "Standard deviation": "Độ lệch chuẩn",
  "Coefficient of variation": "Hệ số biến thiên",
  "Skewness": "Độ lệch",
  "Excess kurtosis": "Độ nhọn (so với phân phối chuẩn)",
  "Share (%)": "Thị phần (%)",
  "Papers per year": "Số bài mỗi năm",
  "{{value}}% per year in recent years": "{{value}}%/năm trong những năm gần đây",
  "{{value}} over the whole window": "{{value}} trên cả giai đoạn xét",
} as const;

export const trendEdaStrings = Object.fromEntries(Object.keys(trendEdaViStrings).map((key) => [key, key])) as Record<keyof typeof trendEdaViStrings, string>;
