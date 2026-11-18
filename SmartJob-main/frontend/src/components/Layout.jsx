import { useState, useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  BriefcaseBusiness,
  LogOut,
  Menu,
  UserRound,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Logo } from './UI.jsx';

export default function Layout() {
  const { user, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    setMenu(false);
    window.scrollTo(0, 0);
  }, [pathname]);
  const recruiter = user?.role === 'RECRUITER';
  function signOut() {
    logout();
    navigate('/');
  }
  return (
    <>
      <a className="skip-link" href="#main-content">
        Bỏ qua điều hướng
      </a>
      <header className="site-header">
        <div className="container header-inner">
          <Logo />
          <nav className={`main-nav ${menu ? 'is-open' : ''}`} aria-label="Điều hướng chính">
            <NavLink to="/jobs">Việc làm</NavLink>
            {!recruiter && <NavLink to="/recommendations">Gợi ý</NavLink>}
            {user?.role === 'CANDIDATE' && <NavLink to="/ai-advisor">Tư vấn AI</NavLink>}
            {user && (
              <NavLink to={recruiter ? '/recruiter' : '/applications'}>
                {recruiter ? 'Tuyển dụng' : 'Ứng tuyển'}
              </NavLink>
            )}
            {user && <NavLink to="/profile">Hồ sơ</NavLink>}
            {!user && (
              <Link to="/register?role=RECRUITER">
                Nhà tuyển dụng <ArrowUpRight size={14} />
              </Link>
            )}
          </nav>
          <div className="header-actions">
            {user ? (
              <>
                <Link className="profile-link" to="/profile" title={user.name}>
                  <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
                  <span className="profile-name">{user.name}</span>
                </Link>
                <button
                  className="icon-button"
                  title="Đăng xuất"
                  aria-label="Đăng xuất"
                  onClick={signOut}
                >
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <>
                <Link className="login-link" to="/login">
                  Đăng nhập
                </Link>
                <Link className="btn btn-primary btn-small" to="/register">
                  Đăng ký
                </Link>
              </>
            )}
            <button
              className="mobile-menu icon-button"
              aria-label={menu ? 'Đóng menu' : 'Mở menu'}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>

      <main id="main-content">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container footer-top">
          <div>
            <Logo />
            <p>
              Kết nối đúng kỹ năng.
              <br />
              Mở lối đúng sự nghiệp.
            </p>
          </div>
          <div>
            <h4>Khám phá cơ hội</h4>
            <Link to="/jobs">Tất cả việc làm</Link>
            <Link to="/recommendations">Gợi ý việc làm phù hợp</Link>
            <Link to="/applications">Hồ sơ đã ứng tuyển</Link>
          </div>
          <div>
            <h4>Cùng SmartJob</h4>
            <Link to="/profile">
              <UserRound size={14} /> Hồ sơ của bạn
            </Link>
            <Link to={recruiter ? '/recruiter' : '/register?role=RECRUITER'}>
              <BriefcaseBusiness size={14} /> Dành cho nhà tuyển dụng
            </Link>
            <a href="mailto:contact@smartjob.local">Liên hệ hỗ trợ</a>
          </div>
          <div className="footer-note">
            <span className="eyebrow">MỘT BƯỚC GẦN HƠN</span>
            <h3>
              Sự nghiệp tiếp theo
              <br />
              đang chờ bạn.
            </h3>
            <Link to="/jobs">
              Bắt đầu khám phá <ArrowUpRight size={17} />
            </Link>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© {new Date().getFullYear()} SmartJob. Dự án môn Phát triển hướng dịch vụ.</span>
          <span>SmartJob · SOA coursework</span>
        </div>
      </footer>
    </>
  );
}
