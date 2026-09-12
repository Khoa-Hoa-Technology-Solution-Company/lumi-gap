const AUTH_MESSAGE_TRANSLATIONS: Record<string, string> = {
  'Account created successfully. Please login.': 'Tạo tài khoản thành công. Vui lòng đăng nhập.',
  'Email is required.': 'Vui lòng nhập email.',
  'Please enter a valid email address.': 'Vui lòng nhập email hợp lệ.',
  'Invalid email format': 'Email không đúng định dạng.',
  'Password is required.': 'Vui lòng nhập mật khẩu.',
  'Login failed': 'Đăng nhập thất bại.',
  'Email and password are required': 'Vui lòng nhập email và mật khẩu.',
  'Invalid email or password': 'Email hoặc mật khẩu không đúng.',
  'Your account has been banned': 'Tài khoản của bạn đã bị khóa.',
  'Missing required fields': 'Vui lòng điền đầy đủ thông tin.',
  'Please enter your full name': 'Vui lòng nhập họ và tên.',
  'Full name contains invalid characters': 'Họ và tên chứa ký tự không hợp lệ.',
  'Please select your university.': 'Vui lòng chọn trường đại học.',
  'Please choose a university from the list.': 'Vui lòng chọn trường đại học trong danh sách.',
  'Passwords do not match': 'Mật khẩu xác nhận không khớp.',
  'Email already exists': 'Email này đã được sử dụng.',
  'Register failed': 'Đăng ký thất bại.',
};

export function translateAuthMessage(message: string) {
  return AUTH_MESSAGE_TRANSLATIONS[message] || message;
}
