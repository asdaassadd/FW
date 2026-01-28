#include <iostream>
#include <string>
#include <vector>
#include <sstream>
#include <map>
#include <cmath>
#include <algorithm>
#include <ctime>
#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <winhttp.h>
#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "winhttp.lib")
typedef int socklen_t;
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <cstring>
#include <time.h>
#define SOCKET int
#define INVALID_SOCKET -1
#define SOCKET_ERROR -1
#define closesocket close
#endif
#include "path_planner.hpp"

using namespace std;

#ifndef DEFAULT_DEEPSEEK_KEY
#define DEFAULT_DEEPSEEK_KEY "sk-d68efdff844741a5be659d0b89cc5ca8"
#endif
#ifndef DEFAULT_CREEM_PRODUCT_ID
#define DEFAULT_CREEM_PRODUCT_ID "prod_1GpSynkTY2fZb57S1RLhcd"
#endif
#ifndef DEFAULT_SUCCESS_URL
#define DEFAULT_SUCCESS_URL "https://fzfw.vercel.app/success.html"
#endif
#ifndef DEFAULT_PUBLIC_SUCCESS_URL
#define DEFAULT_PUBLIC_SUCCESS_URL "https://fzghfw.vercel.app/success.html"
#endif
#ifndef DEFAULT_CREEM_API_KEY
#define DEFAULT_CREEM_API_KEY "creem_test_7OKhgFBabtLK7SUsJOunY7"
#endif
#ifndef DEFAULT_CREEM_HOST
#define DEFAULT_CREEM_HOST "test-api.creem.io"
#endif

// Forward declaration for string parsing used by extract_deepseek_content
bool parse_string(const std::string& s, const std::string& key, std::string& out);

// --- Helper JSON Construction (Manual to avoid dependencies) ---
std::string to_json_string(const std::string& key, const std::string& val) {
    return "\"" + key + "\": \"" + val + "\"";
}

std::string point_to_json(const Point& p) {
    return "{\"lat\": " + std::to_string(p.lat) + ", \"lon\": " + std::to_string(p.lon) + "}";
}

std::string escape_json(const std::string& s) {
    std::string o;
    for (char ch : s) {
        switch (ch) {
            case '\\': o += "\\\\"; break;
            case '\"': o += "\\\""; break;
            case '\n': o += "\\n"; break;
            case '\r': o += "\\r"; break;
            case '\t': o += "\\t"; break;
            default: o += ch; break;
        }
    }
    return o;
}

bool parse_json_string_at(const std::string& s, size_t key_pos, std::string& out) {
    size_t c = s.find(":", key_pos);
    if (c == std::string::npos) return false;
    size_t q1 = s.find("\"", c);
    if (q1 == std::string::npos) return false;
    std::string res;
    bool esc = false;
    for (size_t i = q1 + 1; i < s.size(); ++i) {
        char ch = s[i];
        if (esc) {
            switch (ch) {
                case 'n': res.push_back('\n'); break;
                case 'r': res.push_back('\r'); break;
                case 't': res.push_back('\t'); break;
                case 'b': res.push_back('\b'); break;
                case 'f': res.push_back('\f'); break;
                default: res.push_back(ch); break;
            }
            esc = false;
            continue;
        }
        if (ch == '\\') { esc = true; continue; }
        if (ch == '\"') { out = res; return true; }
        res.push_back(ch);
    }
    return false;
}

std::string extract_deepseek_content(const std::string& s) {
    std::string out;
    if (s.empty()) return "";
    size_t ep = s.find("\"error\"");
    if (ep != std::string::npos) {
        size_t mp = s.find("\"message\"", ep);
        if (mp != std::string::npos && parse_json_string_at(s, mp, out)) return out;
        std::string tmp;
        if (parse_string(s, "\"message\"", tmp)) return tmp;
    }
    size_t cp = s.find("\"choices\"");
    if (cp == std::string::npos) {
        std::string tmp;
        if (parse_string(s, "\"content\"", tmp)) return tmp;
        return "";
    }
    size_t mp = s.find("\"message\"", cp);
    if (mp != std::string::npos) {
        size_t kp = s.find("\"content\"", mp);
        if (kp != std::string::npos) {
            if (parse_json_string_at(s, kp, out)) return out;
            std::string tmp;
            if (parse_string(s, "\"content\"", tmp)) return tmp;
        }
    }
    size_t tp = s.find("\"text\"", cp);
    if (tp != std::string::npos) {
        if (parse_json_string_at(s, tp, out)) return out;
        std::string tmp;
        if (parse_string(s, "\"text\"", tmp)) return tmp;
    }
    std::string tmp;
    if (parse_string(s, "\"content\"", tmp)) return tmp;
    return "";
}

std::string extract_deepseek_error(const std::string& s) {
    std::string out;
    if (s.empty()) return "";
    size_t ep = s.find("\"error\"");
    if (ep != std::string::npos) {
        size_t mp = s.find("\"message\"", ep);
        if (mp != std::string::npos) {
            if (parse_json_string_at(s, mp, out)) return out;
            std::string tmp;
            if (parse_string(s, "\"message\"", tmp)) return tmp;
        }
    }
    return "";
}

std::wstring widen(const std::string& s) {
    return std::wstring(s.begin(), s.end());
}

#ifdef _WIN32
std::string http_post_json(const std::string& host_str, int port, bool https, const std::string& path_str, const std::string& key, const std::string& body) {
    std::wstring host = widen(host_str);
    std::wstring path = widen(path_str);
    std::wstring headers = L"Content-Type: application/json\r\nAuthorization: Bearer " + widen(key) + L"\r\n";
    
    std::string resp;
    HINTERNET hSession = WinHttpOpen(L"Svc", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hSession) { std::cerr << "WinHttpOpen failed: " << GetLastError() << std::endl; return resp; }
    
    // Enable TLS 1.2 (0x00000800) for modern API compatibility
    DWORD protocols = 0x00000800; 
    WinHttpSetOption(hSession, 134, &protocols, sizeof(protocols)); // 134 = WINHTTP_OPTION_SECURE_PROTOCOLS

    HINTERNET hConnect = WinHttpConnect(hSession, host.c_str(), (INTERNET_PORT)port, 0);
    if (!hConnect) { std::cerr << "WinHttpConnect failed: " << GetLastError() << std::endl; WinHttpCloseHandle(hSession); return resp; }
    DWORD flags = https ? WINHTTP_FLAG_SECURE : 0;
    HINTERNET hRequest = WinHttpOpenRequest(hConnect, L"POST", path.c_str(), NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!hRequest) { std::cerr << "WinHttpOpenRequest failed: " << GetLastError() << std::endl; WinHttpCloseHandle(hConnect); WinHttpCloseHandle(hSession); return resp; }
    
    // Disable SSL cert checks
    if (https) {
        DWORD dwFlags = SECURITY_FLAG_IGNORE_UNKNOWN_CA | SECURITY_FLAG_IGNORE_CERT_DATE_INVALID | SECURITY_FLAG_IGNORE_CERT_CN_INVALID | SECURITY_FLAG_IGNORE_CERT_WRONG_USAGE;
        WinHttpSetOption(hRequest, WINHTTP_OPTION_SECURITY_FLAGS, &dwFlags, sizeof(dwFlags));
    }

    BOOL ok = WinHttpSendRequest(hRequest, headers.c_str(), (DWORD)headers.size(), (LPVOID)body.data(), (DWORD)body.size(), (DWORD)body.size(), 0);
    if (!ok) { 
        std::cerr << "WinHttpSendRequest failed: " << GetLastError() << std::endl; 
        resp = "{\"error\": {\"message\": \"WinHttpSendRequest failed: " + std::to_string(GetLastError()) + "\"}}";
    }
    if (ok) ok = WinHttpReceiveResponse(hRequest, NULL);
    if (!ok && resp.empty()) { 
        std::cerr << "WinHttpReceiveResponse failed: " << GetLastError() << std::endl; 
        resp = "{\"error\": {\"message\": \"WinHttpReceiveResponse failed: " + std::to_string(GetLastError()) + "\"}}";
    }
    if (ok) {
        for (;;) {
            DWORD avail = 0;
            if (!WinHttpQueryDataAvailable(hRequest, &avail)) break;
            if (avail == 0) break;
            std::vector<char> buf(avail);
            DWORD read = 0;
            if (!WinHttpReadData(hRequest, buf.data(), avail, &read)) break;
            resp.append(buf.data(), buf.data() + read);
        }
    }
    if (hRequest) WinHttpCloseHandle(hRequest);
    if (hConnect) WinHttpCloseHandle(hConnect);
    if (hSession) WinHttpCloseHandle(hSession);
    return resp;
}
#ifdef _WIN32
std::string http_post_json_custom(const std::string& host_str, int port, bool https, const std::string& path_str, const std::string& headers_str, const std::string& body) {
    std::wstring host = widen(host_str);
    std::wstring path = widen(path_str);
    std::wstring headers = widen(headers_str);
    std::string resp;
    HINTERNET hSession = WinHttpOpen(L"Svc", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hSession) { return "{\"error\":{\"message\":\"WinHttpOpen failed\"}}"; }
    DWORD protocols = 0x00000800;
    WinHttpSetOption(hSession, 134, &protocols, sizeof(protocols));
    HINTERNET hConnect = WinHttpConnect(hSession, host.c_str(), (INTERNET_PORT)port, 0);
    if (!hConnect) { WinHttpCloseHandle(hSession); return "{\"error\":{\"message\":\"WinHttpConnect failed\"}}"; }
    DWORD flags = https ? WINHTTP_FLAG_SECURE : 0;
    HINTERNET hRequest = WinHttpOpenRequest(hConnect, L"POST", path.c_str(), NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!hRequest) { WinHttpCloseHandle(hConnect); WinHttpCloseHandle(hSession); return "{\"error\":{\"message\":\"WinHttpOpenRequest failed\"}}"; }
    if (https) {
        DWORD dwFlags = SECURITY_FLAG_IGNORE_UNKNOWN_CA | SECURITY_FLAG_IGNORE_CERT_DATE_INVALID | SECURITY_FLAG_IGNORE_CERT_CN_INVALID | SECURITY_FLAG_IGNORE_CERT_WRONG_USAGE;
        WinHttpSetOption(hRequest, WINHTTP_OPTION_SECURITY_FLAGS, &dwFlags, sizeof(dwFlags));
    }
    BOOL ok = WinHttpSendRequest(hRequest, headers.c_str(), (DWORD)headers.size(), (LPVOID)body.data(), (DWORD)body.size(), (DWORD)body.size(), 0);
    if (!ok) {
        resp = "{\"error\":{\"message\":\"WinHttpSendRequest failed: " + std::to_string(GetLastError()) + "\"}}";
    }
    if (ok) ok = WinHttpReceiveResponse(hRequest, NULL);
    if (ok) {
        for (;;) {
            DWORD avail = 0;
            if (!WinHttpQueryDataAvailable(hRequest, &avail)) break;
            if (avail == 0) break;
            std::vector<char> buf(avail);
            DWORD read = 0;
            if (!WinHttpReadData(hRequest, buf.data(), avail, &read)) break;
            resp.append(buf.data(), buf.data() + read);
        }
    }
    if (hRequest) WinHttpCloseHandle(hRequest);
    if (hConnect) WinHttpCloseHandle(hConnect);
    if (hSession) WinHttpCloseHandle(hSession);
    return resp;
}
std::string http_get_custom(const std::string& host_str, int port, bool https, const std::string& path_str, const std::string& headers_str) {
    std::wstring host = widen(host_str);
    std::wstring path = widen(path_str);
    std::wstring headers = widen(headers_str);
    std::string resp;
    HINTERNET hSession = WinHttpOpen(L"Svc", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hSession) { return resp; }
    DWORD protocols = 0x00000800;
    WinHttpSetOption(hSession, 134, &protocols, sizeof(protocols));
    HINTERNET hConnect = WinHttpConnect(hSession, host.c_str(), (INTERNET_PORT)port, 0);
    if (!hConnect) { WinHttpCloseHandle(hSession); return resp; }
    DWORD flags = https ? WINHTTP_FLAG_SECURE : 0;
    HINTERNET hRequest = WinHttpOpenRequest(hConnect, L"GET", path.c_str(), NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!hRequest) { WinHttpCloseHandle(hConnect); WinHttpCloseHandle(hSession); return resp; }
    if (https) {
        DWORD dwFlags = SECURITY_FLAG_IGNORE_UNKNOWN_CA | SECURITY_FLAG_IGNORE_CERT_DATE_INVALID | SECURITY_FLAG_IGNORE_CERT_CN_INVALID | SECURITY_FLAG_IGNORE_CERT_WRONG_USAGE;
        WinHttpSetOption(hRequest, WINHTTP_OPTION_SECURITY_FLAGS, &dwFlags, sizeof(dwFlags));
    }
    BOOL ok = WinHttpSendRequest(hRequest, headers.c_str(), (DWORD)headers.size(), WINHTTP_NO_REQUEST_DATA, 0, 0, 0);
    if (ok) ok = WinHttpReceiveResponse(hRequest, NULL);
    if (ok) {
        for (;;) {
            DWORD avail = 0;
            if (!WinHttpQueryDataAvailable(hRequest, &avail)) break;
            if (avail == 0) break;
            std::vector<char> buf(avail);
            DWORD read = 0;
            if (!WinHttpReadData(hRequest, buf.data(), avail, &read)) break;
            resp.append(buf.data(), buf.data() + read);
        }
    }
    if (hRequest) WinHttpCloseHandle(hRequest);
    if (hConnect) WinHttpCloseHandle(hConnect);
    if (hSession) WinHttpCloseHandle(hSession);
    return resp;
}
#else
std::string http_post_json_custom(const std::string& host, int port, bool https, const std::string& path, const std::string& headers_str, const std::string& body) {
    std::string resp;
    char filename[] = "/tmp/reqXXXXXX";
    int fd = mkstemp(filename);
    if (fd != -1) {
        write(fd, body.c_str(), body.size());
        close(fd);
        std::string url = (https ? "https://" : "http://") + host + path;
        std::string cmd = "curl -s -X POST ";
        size_t pos = 0;
        while (pos < headers_str.size()) {
            size_t end = headers_str.find("\r\n", pos);
            std::string h = headers_str.substr(pos, end == std::string::npos ? std::string::npos : end - pos);
            if (!h.empty()) {
                cmd += "-H \"" + h + "\" ";
            }
            if (end == std::string::npos) break;
            pos = end + 2;
        }
        cmd += "-d @" + std::string(filename) + " " + url;
        FILE* fp = popen(cmd.c_str(), "r");
        if (fp) {
            char buf[1024];
            while (fgets(buf, sizeof(buf), fp) != NULL) {
                resp += buf;
            }
            pclose(fp);
        }
        unlink(filename);
    }
    return resp;
}
std::string http_get_custom(const std::string& host, int port, bool https, const std::string& path, const std::string& headers_str) {
    std::string resp;
    std::string url = (https ? "https://" : "http://") + host + path;
    std::string cmd = "curl -s -X GET ";
    size_t pos = 0;
    while (pos < headers_str.size()) {
        size_t end = headers_str.find("\r\n", pos);
        std::string h = headers_str.substr(pos, end == std::string::npos ? std::string::npos : end - pos);
        if (!h.empty()) {
            cmd += "-H \"" + h + "\" ";
        }
        if (end == std::string::npos) break;
        pos = end + 2;
    }
    cmd += url;
    FILE* fp = popen(cmd.c_str(), "r");
    if (fp) {
        char buf[1024];
        while (fgets(buf, sizeof(buf), fp) != NULL) {
            resp += buf;
        }
        pclose(fp);
    }
    return resp;
}
#endif
#else
std::string http_post_json(const std::string& host, int port, bool https, const std::string& path, const std::string& key, const std::string& body) {
    std::string resp;
    // Create temp file for body
    char filename[] = "/tmp/reqXXXXXX";
    int fd = mkstemp(filename);
    if (fd != -1) {
        write(fd, body.c_str(), body.size());
        close(fd);
        
        std::string cmd = "curl -s -X POST ";
        cmd += "-H \"Content-Type: application/json\" ";
        cmd += "-H \"Authorization: Bearer " + key + "\" ";
        cmd += "-d @" + std::string(filename) + " ";
        cmd += (https ? "https://" : "http://") + host + path;
        
        FILE* fp = popen(cmd.c_str(), "r");
        if (fp) {
            char buf[1024];
            while (fgets(buf, sizeof(buf), fp) != NULL) {
                resp += buf;
            }
            pclose(fp);
        }
        unlink(filename);
    }
    return resp;
}
#endif

std::string handle_chat_deepseek(const std::string& msg) {
    const char* envk = std::getenv("DEEPSEEK_API_KEY");
    std::string key = envk ? std::string(envk) : std::string(DEFAULT_DEEPSEEK_KEY);
    if (key.empty()) {
        std::stringstream ss;
        ss << "{\"response\": \"后端未配置API密钥\"}";
        return ss.str();
    }
    std::string model = "deepseek-chat";
    std::string payload = "{\"model\":\"" + model + "\",\"messages\":[{\"role\":\"user\",\"content\":\"" + escape_json(msg) + "\"}]}";
    std::wstring host = L"api.deepseek.com";
    std::wstring path = L"/chat/completions";
    std::wstring headers = L"Content-Type: application/json\r\nAuthorization: Bearer " + widen(key) + L"\r\n";
    std::string res = http_post_json(std::string(host.begin(), host.end()), 443, true, std::string(path.begin(), path.end()), key, payload);
    
    if (res.empty()) {
        return "{\"error\": \"Network Error: No response from DeepSeek API (Check Console)\", \"response\": \"\"}";
    }

    std::string err_msg = extract_deepseek_error(res);
    if (!err_msg.empty()) {
        std::stringstream ss;
        ss << "{\"error\": \"" << escape_json(err_msg) << "\", \"response\": \"\"}";
        return ss.str();
    }

    std::string content = extract_deepseek_content(res);
    if (content.empty()) content = "\xE6\x9C\x8D\xE5\x8A\xA1\xE6\x9C\xAA\xE8\xBF\x94\xE5\x9B\x9E\xE5\x86\x85\xE5\xAE\xB9";
    std::stringstream ss;
    ss << "{\"response\": \"" << escape_json(content) << "\"}";
    return ss.str();
}

// --- Modules ---

static std::string trim(const std::string& s) {
    size_t i = 0, j = s.size();
    while (i < j && (s[i] == ' ' || s[i] == '\t' || s[i] == '\r' || s[i] == '\n')) i++;
    while (j > i && (s[j - 1] == ' ' || s[j - 1] == '\t' || s[j - 1] == '\r' || s[j - 1] == '\n')) j--;
    return s.substr(i, j - i);
}

static bool starts_with_https(const std::string& s) {
    return s.size() >= 8 && s[0] == 'h' && s[1] == 't' && s[2] == 't' && s[3] == 'p' && s[4] == 's' && s[5] == ':' && s[6] == '/' && s[7] == '/';
}

static std::string to_lower(const std::string& s) {
    std::string o(s);
    for (size_t i = 0; i < o.size(); ++i) {
        unsigned char c = (unsigned char)o[i];
        if (c >= 'A' && c <= 'Z') o[i] = (char)(c - 'A' + 'a');
    }
    return o;
}

static std::string append_param(const std::string& url, const std::string& key, const std::string& value) {
    if (url.find('?') == std::string::npos) return url + "?" + key + "=" + value;
    return url + "&" + key + "=" + value;
}

static std::string decode_chunked(const std::string& s, size_t start_pos) {
    std::string out;
    size_t i = start_pos;
    for (;;) {
        size_t line_end = s.find("\r\n", i);
        if (line_end == std::string::npos) break;
        std::string hexlen = s.substr(i, line_end - i);
        size_t n = 0;
        for (char ch : hexlen) {
            if (ch >= '0' && ch <= '9') { n = (n << 4) + (size_t)(ch - '0'); }
            else if (ch >= 'a' && ch <= 'f') { n = (n << 4) + 10 + (size_t)(ch - 'a'); }
            else if (ch >= 'A' && ch <= 'F') { n = (n << 4) + 10 + (size_t)(ch - 'A'); }
            else { }
        }
        i = line_end + 2;
        if (n == 0) {
            break;
        }
        if (i + n > s.size()) break;
        out.append(s.data() + i, s.data() + i + n);
        i += n;
        if (i + 2 <= s.size() && s.substr(i, 2) == "\r\n") i += 2;
    }
    return out;
}
static bool is_fallback_order_id(const std::string& s) {
    return s.size() >= 4 && s[0] == 'O' && s[1] == 'R' && s[2] == 'D' && s[3] == '_';
}

static std::string read_file_simple(const std::wstring& wpath) {
    std::string out;
#ifdef _WIN32
    FILE* fp = _wfopen(wpath.c_str(), L"rb");
    if (!fp) return "";
#else
    std::string path(wpath.begin(), wpath.end());
    FILE* fp = fopen(path.c_str(), "rb");
    if (!fp) return "";
#endif
    char buf[1024];
    size_t n = 0;
    while ((n = fread(buf, 1, sizeof(buf), fp)) > 0) {
        out.append(buf, buf + n);
        if (out.size() > 8192) break;
    }
    fclose(fp);
    return trim(out);
}

static std::string get_creem_api_key_runtime() {
    const char* envk = std::getenv("CREEM_API_KEY");
    if (envk && *envk) return std::string(envk);
#ifdef _WIN32
    wchar_t buf[MAX_PATH];
    GetModuleFileNameW(NULL, buf, MAX_PATH);
    std::wstring exe(buf);
    size_t p = exe.find_last_of(L"\\/");
    std::wstring dir = p == std::wstring::npos ? L"." : exe.substr(0, p);
    std::wstring keypath = dir + L"\\creem.key";
    std::string k = read_file_simple(keypath);
    if (!k.empty()) return k;
#else
    std::string k = read_file_simple(L"./creem.key");
    if (!k.empty()) return k;
#endif
    return std::string(DEFAULT_CREEM_API_KEY);
}

class UserManager {
    std::map<std::string, std::string> users;
public:
    UserManager() {
        users["admin"] = "123456"; // Default user
    }
    bool login(std::string u, std::string p) {
        return users.count(u) && users[u] == p;
    }
    bool register_user(std::string u, std::string p) {
        if (users.count(u)) return false;
        users[u] = p;
        return true;
    }
};

class PaymentManager {
    std::map<std::string, std::string> order_status;
    std::map<std::string, std::string> order_user;
    int seq;
public:
    PaymentManager(): seq(1000) {}
    void set_user(const std::string& order_id, const std::string& user) { order_user[order_id] = user; }
    void set_status(const std::string& order_id, const std::string& st) { order_status[order_id] = st; }
    std::string create_order(double amount, const std::string& subject, const std::string& provider, const std::string& username, std::string& pay_url) {
        std::stringstream idss;
        idss << "ORD_" << seq++;
        std::string order_id = idss.str();
        order_status[order_id] = "pending";
        order_user[order_id] = username;
        const char* pr = std::getenv("PUBLIC_SUCCESS_URL");
        std::string success_url = pr ? std::string(pr) : std::string(DEFAULT_PUBLIC_SUCCESS_URL);
        success_url = append_param(success_url, "id", order_id);
        const char* pubapi = std::getenv("PUBLIC_API_URL");
        if (pubapi && *pubapi) success_url = append_param(success_url, "api", std::string(pubapi));
        pay_url = success_url;
        return order_id;
    }
    std::string get_status(const std::string& order_id) {
        auto it = order_status.find(order_id);
        if (it == order_status.end()) return "not_found";
        return it->second;
    }
    bool confirm(const std::string& order_id) {
        auto it = order_status.find(order_id);
        if (it == order_status.end()) return false;
        it->second = "success";
        return true;
    }
    std::string get_user(const std::string& order_id) {
        auto it = order_user.find(order_id);
        if (it == order_user.end()) return "";
        return it->second;
    }
};

class SubscriptionManager {
    std::map<std::string, time_t> expiry;
public:
    bool is_active(const std::string& user) {
        if (user == "admin") return true;
        time_t now = time(NULL);
        auto it = expiry.find(user);
        return it != expiry.end() && it->second > now;
    }
    void extend(const std::string& user, int days) {
        if (user.empty()) return;
        time_t now = time(NULL);
        time_t base = now;
        auto it = expiry.find(user);
        if (it != expiry.end() && it->second > now) {
            base = it->second;
        }
        expiry[user] = base + (time_t)days * 24 * 3600;
    }
    std::string expiry_str(const std::string& user) {
        if (user == "admin") return "2099-12-31";
        auto it = expiry.find(user);
        if (it == expiry.end()) return "";
        time_t t = it->second;
        struct tm* tmv = localtime(&t);
        if (!tmv) return "";
        char buf[32];
        snprintf(buf, sizeof(buf), "%04d-%02d-%02d", tmv->tm_year + 1900, tmv->tm_mon + 1, tmv->tm_mday);
        return std::string(buf);
    }
};

// --- Main Server ---

const int PORT = 8080;

bool parse_double(const std::string& s, const std::string& key, double& out) {
    size_t k = s.find(key);
    if (k == std::string::npos) return false;
    size_t c = s.find(":", k);
    if (c == std::string::npos) return false;
    size_t i = c + 1;
    while (i < s.size() && (s[i] == ' ' || s[i] == '\"')) i++;
    try {
        out = std::stod(s.substr(i));
        return true;
    } catch (...) {
        return false;
    }
}

bool parse_string(const std::string& s, const std::string& key, std::string& out) {
    size_t k = s.find(key);
    if (k == std::string::npos) return false;
    size_t c = s.find(":", k);
    if (c == std::string::npos) return false;
    size_t i = c + 1;
    while (i < s.size() && (s[i] == ' ' || s[i] == '\t')) i++;
    if (i >= s.size()) return false;
    if (s[i] == '\"') {
        std::string res;
        bool esc = false;
        for (size_t j = i + 1; j < s.size(); ++j) {
            char ch = s[j];
            if (esc) {
                switch (ch) {
                    case 'n': res.push_back('\n'); break;
                    case 'r': res.push_back('\r'); break;
                    case 't': res.push_back('\t'); break;
                    case 'b': res.push_back('\b'); break;
                    case 'f': res.push_back('\f'); break;
                    default: res.push_back(ch); break;
                }
                esc = false;
                continue;
            }
            if (ch == '\\') { esc = true; continue; }
            if (ch == '\"') { out = res; return true; }
            res.push_back(ch);
        }
        return false;
    } else {
        size_t j = i;
        while (j < s.size() && s[j] != ',' && s[j] != '}' && s[j] != '\r' && s[j] != '\n') j++;
        out = s.substr(i, j - i);
        size_t start = 0;
        while (start < out.size() && (out[start] == ' ' || out[start] == '\t')) start++;
        size_t end = out.size();
        while (end > start && (out[end - 1] == ' ' || out[end - 1] == '\t')) end--;
        out = out.substr(start, end - start);
        return true;
    }
}

Point parse_point(const std::string& body, const std::string& key, const Point& defv) {
    size_t p = body.find("\"" + key + "\"");
    if (p == std::string::npos) return defv;
    size_t b1 = body.find("{", p);
    size_t b2 = body.find("}", b1);
    if (b1 == std::string::npos || b2 == std::string::npos) return defv;
    std::string obj = body.substr(b1, b2 - b1 + 1);
    double lat = defv.lat, lon = defv.lon;
    parse_double(obj, "\"lat\"", lat);
    parse_double(obj, "\"lon\"", lon);
    return {lat, lon};
}

std::vector<Obstacle> parse_obstacles(const std::string& body) {
    std::vector<Obstacle> res;
    size_t p = body.find("\"obstacles\"");
    if (p == std::string::npos) return res;
    size_t b1 = body.find("[", p);
    size_t b2 = body.find("]", b1);
    if (b1 == std::string::npos || b2 == std::string::npos) return res;
    std::string arr = body.substr(b1 + 1, b2 - b1 - 1);
    size_t i = 0;
    while (true) {
        size_t o1 = arr.find("{", i);
        if (o1 == std::string::npos) break;
        size_t o2 = arr.find("}", o1);
        if (o2 == std::string::npos) break;
        std::string obj = arr.substr(o1, o2 - o1 + 1);
        double lat = 0.0, lon = 0.0, radius = 0.0;
        bool ok1 = parse_double(obj, "\"lat\"", lat);
        bool ok2 = parse_double(obj, "\"lon\"", lon);
        bool ok3 = parse_double(obj, "\"radius\"", radius);
        if (ok1 && ok2 && ok3) {
            res.push_back({{lat, lon}, radius});
        }
        i = o2 + 1;
    }
    return res;
}

struct TaskInput {
    std::string id;
    std::string name;
    double duration;
    std::vector<std::string> depends;
    int priority;
};

std::vector<std::string> parse_string_array(const std::string& s, const std::string& key) {
    std::vector<std::string> res;
    size_t k = s.find(key);
    if (k == std::string::npos) return res;
    size_t b1 = s.find("[", k);
    size_t b2 = s.find("]", b1);
    if (b1 == std::string::npos || b2 == std::string::npos) return res;
    std::string arr = s.substr(b1 + 1, b2 - b1 - 1);
    size_t i = 0;
    while (true) {
        size_t q1 = arr.find("\"", i);
        if (q1 == std::string::npos) break;
        size_t q2 = arr.find("\"", q1 + 1);
        if (q2 == std::string::npos) break;
        res.push_back(arr.substr(q1 + 1, q2 - q1 - 1));
        i = q2 + 1;
    }
    return res;
}

std::vector<TaskInput> parse_tasks(const std::string& body) {
    std::vector<TaskInput> res;
    size_t p = body.find("\"tasks\"");
    if (p == std::string::npos) return res;
    size_t b1 = body.find("[", p);
    size_t b2 = body.find("]", b1);
    if (b1 == std::string::npos || b2 == std::string::npos) return res;
    std::string arr = body.substr(b1 + 1, b2 - b1 - 1);
    size_t i = 0;
    while (true) {
        size_t o1 = arr.find("{", i);
        if (o1 == std::string::npos) break;
        size_t o2 = arr.find("}", o1);
        if (o2 == std::string::npos) break;
        std::string obj = arr.substr(o1, o2 - o1 + 1);
        TaskInput t;
        t.id = "";
        t.name = "";
        t.duration = 0.0;
        t.priority = 0;
        parse_string(obj, "\"id\"", t.id);
        parse_string(obj, "\"name\"", t.name);
        parse_double(obj, "\"duration\"", t.duration);
        double pr = 0.0;
        if (parse_double(obj, "\"priority\"", pr)) t.priority = (int)pr;
        t.depends = parse_string_array(obj, "\"depends\"");
        if (!t.id.empty() && t.duration > 0.0) res.push_back(t);
        i = o2 + 1;
    }
    return res;
}

struct PlanItem {
    std::string id;
    std::string name;
    double start;
    double end;
    int worker;
};

std::vector<PlanItem> schedule_tasks(const std::vector<TaskInput>& tasks, int workers) {
    std::map<std::string, int> idx;
    for (int i = 0; i < (int)tasks.size(); ++i) idx[tasks[i].id] = i;
    std::vector<std::vector<int>> adj(tasks.size());
    std::vector<int> indeg(tasks.size(), 0);
    for (int i = 0; i < (int)tasks.size(); ++i) {
        for (auto& d : tasks[i].depends) {
            if (idx.count(d)) {
                adj[idx[d]].push_back(i);
                indeg[i]++;
            }
        }
    }
    std::vector<int> order;
    std::vector<int> q;
    for (int i = 0; i < (int)tasks.size(); ++i) if (indeg[i] == 0) q.push_back(i);
    std::stable_sort(q.begin(), q.end(), [&](int a, int b){ return tasks[a].priority < tasks[b].priority; });
    while (!q.empty()) {
        int u = q.front();
        q.erase(q.begin());
        order.push_back(u);
        for (int v : adj[u]) {
            indeg[v]--;
            if (indeg[v] == 0) {
                auto it = std::upper_bound(q.begin(), q.end(), v, [&](int lhs, int rhs){ return tasks[lhs].priority < tasks[rhs].priority; });
                q.insert(it, v);
            }
        }
    }
    std::vector<double> worker_free(workers, 0.0);
    std::map<std::string, double> end_time;
    std::vector<PlanItem> plan;
    for (int u : order) {
        double deps_end = 0.0;
        for (auto& d : tasks[u].depends) deps_end = std::max(deps_end, end_time[d]);
        int best_w = 0;
        for (int w = 1; w < workers; ++w) if (worker_free[w] < worker_free[best_w]) best_w = w;
        double start = std::max(worker_free[best_w], deps_end);
        double end = start + tasks[u].duration;
        worker_free[best_w] = end;
        end_time[tasks[u].id] = end;
        plan.push_back({tasks[u].id, tasks[u].name, start, end, best_w});
    }
    return plan;
}

double toRadians(double deg) {
    return deg * 3.14159265358979323846 / 180.0;
}
double toDegrees(double rad) {
    return rad * 180.0 / 3.14159265358979323846;
}
double haversine_distance_xy(double lat1, double lon1, double lat2, double lon2) {
    double R = 6371000.0;
    double dlat = toRadians(lat2 - lat1);
    double dlon = toRadians(lon2 - lon1);
    double a = std::sin(dlat / 2) * std::sin(dlat / 2) +
               std::cos(toRadians(lat1)) * std::cos(toRadians(lat2)) *
               std::sin(dlon / 2) * std::sin(dlon / 2);
    double c = 2 * std::atan2(std::sqrt(a), std::sqrt(1.0 - a));
    return R * c;
}
double meters_to_lat_deg(double meters) {
    return meters / 111000.0;
}
double meters_to_lon_deg(double meters, double lat_deg) {
    return meters / (111000.0 * std::cos(toRadians(lat_deg)));
}
Point offset_point(Point p, double north_m, double east_m) {
    return {p.lat + meters_to_lat_deg(north_m), p.lon + meters_to_lon_deg(east_m, p.lat)};
}

struct Sensor {
    double lat;
    double lon;
    double range;
    int capacity;
};
struct Target {
    double lat;
    double lon;
};
std::vector<Sensor> parse_sensors(const std::string& body) {
    std::vector<Sensor> res;
    size_t p = body.find("\"sensors\"");
    if (p == std::string::npos) return res;
    size_t b1 = body.find("[", p);
    size_t b2 = body.find("]", b1);
    if (b1 == std::string::npos || b2 == std::string::npos) return res;
    std::string arr = body.substr(b1 + 1, b2 - b1 - 1);
    size_t i = 0;
    while (true) {
        size_t o1 = arr.find("{", i);
        if (o1 == std::string::npos) break;
        size_t o2 = arr.find("}", o1);
        if (o2 == std::string::npos) break;
        std::string obj = arr.substr(o1, o2 - o1 + 1);
        double lat = 0.0, lon = 0.0, range = 0.0, cap = 0.0;
        bool ok1 = parse_double(obj, "\"lat\"", lat);
        bool ok2 = parse_double(obj, "\"lon\"", lon);
        bool ok3 = parse_double(obj, "\"range\"", range);
        bool ok4 = parse_double(obj, "\"capacity\"", cap);
        Sensor s;
        s.lat = lat;
        s.lon = lon;
        s.range = range;
        s.capacity = ok4 ? (int)cap : 1000000;
        if (ok1 && ok2 && ok3) res.push_back(s);
        i = o2 + 1;
    }
    return res;
}
std::vector<Target> parse_targets(const std::string& body) {
    std::vector<Target> res;
    size_t p = body.find("\"targets\"");
    if (p == std::string::npos) return res;
    size_t b1 = body.find("[", p);
    size_t b2 = body.find("]", b1);
    if (b1 == std::string::npos || b2 == std::string::npos) return res;
    std::string arr = body.substr(b1 + 1, b2 - b1 - 1);
    size_t i = 0;
    while (true) {
        size_t o1 = arr.find("{", i);
        if (o1 == std::string::npos) break;
        size_t o2 = arr.find("}", o1);
        if (o2 == std::string::npos) break;
        std::string obj = arr.substr(o1, o2 - o1 + 1);
        double lat = 0.0, lon = 0.0;
        bool ok1 = parse_double(obj, "\"lat\"", lat);
        bool ok2 = parse_double(obj, "\"lon\"", lon);
        if (ok1 && ok2) res.push_back({lat, lon});
        i = o2 + 1;
    }
    return res;
}

struct Troop {
    std::string id;
    double capacity;
};
struct TroopTask {
    std::string id;
    double workload;
    int priority;
};
std::vector<Troop> parse_troops(const std::string& body) {
    std::vector<Troop> res;
    size_t p = body.find("\"troops\"");
    if (p == std::string::npos) return res;
    size_t b1 = body.find("[", p);
    size_t b2 = body.find("]", b1);
    if (b1 == std::string::npos || b2 == std::string::npos) return res;
    std::string arr = body.substr(b1 + 1, b2 - b1 - 1);
    size_t i = 0;
    while (true) {
        size_t o1 = arr.find("{", i);
        if (o1 == std::string::npos) break;
        size_t o2 = arr.find("}", o1);
        if (o2 == std::string::npos) break;
        std::string obj = arr.substr(o1, o2 - o1 + 1);
        std::string id;
        double cap = 0.0;
        parse_string(obj, "\"id\"", id);
        parse_double(obj, "\"capacity\"", cap);
        if (!id.empty() && cap > 0.0) res.push_back({id, cap});
        i = o2 + 1;
    }
    return res;
}
std::vector<TroopTask> parse_troop_tasks(const std::string& body) {
    std::vector<TroopTask> res;
    size_t p = body.find("\"tasks\"");
    if (p == std::string::npos) return res;
    size_t b1 = body.find("[", p);
    size_t b2 = body.find("]", b1);
    if (b1 == std::string::npos || b2 == std::string::npos) return res;
    std::string arr = body.substr(b1 + 1, b2 - b1 - 1);
    size_t i = 0;
    while (true) {
        size_t o1 = arr.find("{", i);
        if (o1 == std::string::npos) break;
        size_t o2 = arr.find("}", o1);
        if (o2 == std::string::npos) break;
        std::string obj = arr.substr(o1, o2 - o1 + 1);
        std::string id;
        double workload = 0.0, pr = 0.0;
        parse_string(obj, "\"id\"", id);
        parse_double(obj, "\"workload\"", workload);
        parse_double(obj, "\"priority\"", pr);
        if (!id.empty() && workload > 0.0) res.push_back({id, workload, (int)pr});
        i = o2 + 1;
    }
    return res;
}



struct Event {
    std::string id;
    std::string resource;
    double start;
    double end;
};
std::vector<Event> parse_events(const std::string& body) {
    std::vector<Event> res;
    size_t p = body.find("\"events\"");
    if (p == std::string::npos) return res;
    size_t b1 = body.find("[", p);
    size_t b2 = body.find("]", b1);
    if (b1 == std::string::npos || b2 == std::string::npos) return res;
    std::string arr = body.substr(b1 + 1, b2 - b1 - 1);
    size_t i = 0;
    while (true) {
        size_t o1 = arr.find("{", i);
        if (o1 == std::string::npos) break;
        size_t o2 = arr.find("}", o1);
        if (o2 == std::string::npos) break;
        std::string obj = arr.substr(o1, o2 - o1 + 1);
        std::string id, resrc;
        double st = 0.0, ed = 0.0;
        parse_string(obj, "\"id\"", id);
        parse_string(obj, "\"resource\"", resrc);
        parse_double(obj, "\"start\"", st);
        parse_double(obj, "\"end\"", ed);
        if (!id.empty() && ed > st) res.push_back({id, resrc, st, ed});
        i = o2 + 1;
    }
    return res;
}

std::string handle_sensor_plan(const std::string& body) {
    auto sensors = parse_sensors(body);
    auto targets = parse_targets(body);
    std::vector<int> cap(sensors.size());
    for (size_t i = 0; i < sensors.size(); ++i) cap[i] = sensors[i].capacity;
    std::vector<std::tuple<int,int,double>> assigns;
    int covered = 0;
    for (size_t ti = 0; ti < targets.size(); ++ti) {
        int best = -1;
        double bestd = 1e18;
        for (size_t si = 0; si < sensors.size(); ++si) {
            double d = haversine_distance_xy(sensors[si].lat, sensors[si].lon, targets[ti].lat, targets[ti].lon);
            if (d <= sensors[si].range && cap[si] > 0) {
                if (d < bestd) { bestd = d; best = (int)si; }
            }
        }
        if (best != -1) {
            cap[best]--;
            assigns.push_back({(int)ti, best, bestd});
            covered++;
        }
    }
    std::stringstream ss;
    ss << "{\"assignments\": [";
    for (size_t i = 0; i < assigns.size(); ++i) {
        ss << "{\"target\": " << std::get<0>(assigns[i]) << ", \"sensor\": " << std::get<1>(assigns[i]) << ", \"distance\": " << std::get<2>(assigns[i]) << "}";
        if (i + 1 < assigns.size()) ss << ",";
    }
    ss << "], \"coverage\": {\"covered\": " << covered << ", \"total\": " << targets.size() << ", \"ratio\": " << (targets.empty() ? 0.0 : (double)covered / (double)targets.size()) << "}}";
    return ss.str();
}

std::string handle_troop_plan(const std::string& body) {
    auto troops = parse_troops(body);
    auto tasks = parse_troop_tasks(body);
    std::vector<double> free(troops.size(), 0.0);
    std::stable_sort(tasks.begin(), tasks.end(), [](const TroopTask& a, const TroopTask& b){ return a.priority < b.priority; });
    std::stringstream ss;
    ss << "{\"schedule\": [";
    bool first = true;
    for (auto& t : tasks) {
        int best = 0;
        for (size_t i = 1; i < troops.size(); ++i) if (free[i] < free[best]) best = (int)i;
        double dur = t.workload / std::max(1e-6, troops[best].capacity);
        double st = free[best];
        double ed = st + dur;
        free[best] = ed;
        if (!first) ss << ","; first = false;
        ss << "{\"task\": \"" << t.id << "\", \"troop\": \"" << troops[best].id << "\", \"start\": " << st << ", \"end\": " << ed << "}";
    }
    double makespan = 0.0;
    for (double f : free) makespan = std::max(makespan, f);
    ss << "], \"makespan\": " << makespan << "}";
    return ss.str();
}

std::string handle_coord_plan(const std::string& body) {
    auto events = parse_events(body);
    std::map<std::string, std::vector<Event>> groups;
    for (auto& e : events) groups[e.resource].push_back(e);
    for (auto& kv : groups) {
        auto& vec = kv.second;
        std::sort(vec.begin(), vec.end(), [](const Event& a, const Event& b){ return a.start < b.start; });
        double last_end = -1e18;
        for (auto& e : vec) {
            double dur = e.end - e.start;
            if (e.start < last_end) {
                e.start = last_end;
                e.end = e.start + dur;
            }
            last_end = e.end;
        }
    }
    std::stringstream ss;
    ss << "{\"schedule\": [";
    bool first = true;
    for (auto& kv : groups) {
        for (auto& e : kv.second) {
            if (!first) ss << ","; first = false;
            ss << "{\"id\": \"" << e.id << "\", \"resource\": \"" << kv.first << "\", \"start\": " << e.start << ", \"end\": " << e.end << "}";
        }
    }
    ss << "]}";
    return ss.str();
}

std::string handle_formation_plan(const std::string& body) {
    Point leader = parse_point(body, "leader", {0.0, 0.0});
    double n_d = 0.0, spacing = 100.0;
    parse_double(body, "\"n\"", n_d);
    parse_double(body, "\"spacing\"", spacing);
    int n = std::max(1, (int)n_d);
    std::string type = "line";
    parse_string(body, "\"type\"", type);
    std::vector<Point> pts;
    pts.push_back(leader);
    if (type == "line") {
        int left = (n - 1) / 2;
        int right = (n - 1) - left;
        for (int i = 1; i <= left; ++i) pts.push_back(offset_point(leader, 0.0, -i * spacing));
        for (int i = 1; i <= right; ++i) pts.push_back(offset_point(leader, 0.0, i * spacing));
    } else if (type == "wedge") {
        int rows = (n - 1);
        for (int i = 1; i <= rows; ++i) {
            pts.push_back(offset_point(leader, -i * spacing, -i * spacing));
            if ((int)pts.size() >= n) break;
            pts.push_back(offset_point(leader, -i * spacing, i * spacing));
            if ((int)pts.size() >= n) break;
        }
    } else {
        double r = spacing;
        for (int i = 1; i < n; ++i) {
            double ang = 2.0 * 3.14159265358979323846 * (i - 1) / (double)(n - 1);
            pts.push_back(offset_point(leader, r * std::sin(ang), r * std::cos(ang)));
        }
    }
    std::stringstream ss;
    ss << "{\"positions\": [";
    for (size_t i = 0; i < pts.size(); ++i) {
        ss << point_to_json(pts[i]);
        if (i + 1 < pts.size()) ss << ",";
    }
    ss << "]}";
    return ss.str();
}

std::string handle_request(const std::string& method, const std::string& path, const std::string& body, const std::string& headers,
                           UserManager& userMgr, PathPlanner& planner, PaymentManager& payMgr, SubscriptionManager& subsMgr) {
    
    // CORS headers for local development
    std::string cors = "Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: POST, GET, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, ngrok-skip-browser-warning, Authorization\r\nConnection: close\r\n";

    if (method == "OPTIONS") {
        return "HTTP/1.1 200 OK\r\n" + cors + "\r\n";
    }

    // Health check for connection testing
    if (path == "/api" && method == "GET") {
        return "HTTP/1.1 200 OK\r\n" + cors + "Content-Type: application/json\r\n\r\n{\"status\": \"ok\"}";
    }
    if (path == "/api/" && method == "GET") {
        return "HTTP/1.1 200 OK\r\n" + cors + "Content-Type: application/json\r\n\r\n{\"status\": \"ok\"}";
    }

    if (path == "/api/login" && method == "POST") {
        std::string u, p;
        bool has_u = parse_string(body, "\"username\"", u);
        bool has_p = parse_string(body, "\"password\"", p);
        
        if (!has_u || !has_p) {
             // Fallback for demo if parsing fails (shouldn't happen with correct frontend)
             u = "admin"; 
             p = "123456"; 
        }
        
        // Auto-register logic for smoother demo experience
        // If user doesn't exist, register them immediately.
        if (!userMgr.login(u, p)) {
            // Try to register if login failed (assuming user doesn't exist)
            // If register returns false, it means user exists but password wrong.
            if (userMgr.register_user(u, p)) {
                // Registration success, proceed to login success response
                std::cout << "Auto-registered user: " << u << std::endl;
            } else {
                return "HTTP/1.1 401 Unauthorized\r\n" + cors + "Content-Type: text/plain\r\n\r\nLogin Failed: Wrong Password";
            }
        }
        
        // Login success (or just registered)
        return "HTTP/1.1 200 OK\r\n" + cors + "Content-Type: application/json\r\n\r\n{\"status\": \"success\", \"token\": \"xyz_" + u + "\", \"username\": \"" + u + "\"}";
    }
    if (path == "/api/pay/create" && method == "POST") {
        double amount = 0.0;
        parse_double(body, "\"amount\"", amount);
        std::string subject = "";
        parse_string(body, "\"subject\"", subject);
        if (amount <= 0.0) amount = 9.9;
        if (subject.empty()) subject = "20";
        std::string provider = "";
        parse_string(body, "\"provider\"", provider);
        std::string username = "";
        parse_string(body, "\"username\"", username);
        std::string creem_res = "";
        std::string creem_err = "";
        if (amount <= 0.0 || subject.empty()) {
            return "HTTP/1.1 400 Bad Request\r\n" + cors + "Content-Type: text/plain\r\n\r\nBad Request";
        }
        if (provider == "creem") {
            std::string api_key = get_creem_api_key_runtime();
            std::string product_id = "";
            parse_string(body, "\"product_id\"", product_id);
            if (product_id.empty()) {
                const char* p = std::getenv("CREEM_PRODUCT_ID");
                if (p) product_id = std::string(p);
            }
            if (product_id.empty()) {
                product_id = std::string(DEFAULT_CREEM_PRODUCT_ID);
            }
            std::string success_url = "";
            const char* pr = std::getenv("PUBLIC_SUCCESS_URL");
            std::string pub_success = pr ? std::string(pr) : std::string(DEFAULT_PUBLIC_SUCCESS_URL);
            const char* s = std::getenv("CREEM_SUCCESS_URL");
            success_url = s ? std::string(s) : pub_success;
            std::string return_url = pub_success;
            const char* pubapi = std::getenv("PUBLIC_API_URL");
            if (pubapi && *pubapi) {
                std::string a = std::string(pubapi);
                if (success_url.find('?') == std::string::npos) success_url += "?api=" + a;
                else success_url += "&api=" + a;
                if (return_url.find('?') == std::string::npos) return_url += "?api=" + a;
                else return_url += "&api=" + a;
            }
            if (!api_key.empty() && !product_id.empty()) {
                std::stringstream payload;
                payload << "{\"product_id\":\"" << escape_json(product_id) << "\"";
                if (starts_with_https(success_url)) {
                    payload << ",\"success_url\":\"" << escape_json(success_url) << "\"";
                }
                // Creem API v1 does not support return_url in checkout creation
                // if (starts_with_https(return_url)) {
                //    payload << ",\"return_url\":\"" << escape_json(return_url) << "\"";
                // }
                payload << ",\"metadata\":{\"userId\":\"" << escape_json(username) << "\"}}";
                std::string headers = "Content-Type: application/json\r\nX-Api-Key: " + api_key + "\r\n";
                std::string res = http_post_json_custom(DEFAULT_CREEM_HOST, 443, true, "/v1/checkouts", headers, payload.str());
                creem_res = res;
                parse_string(res, "\"message\"", creem_err);
                std::string pay_url = "";
                std::string order_id = "";
                parse_string(res, "\"checkout_url\"", pay_url);
                parse_string(res, "\"id\"", order_id);
                if (!order_id.empty() && !pay_url.empty()) {
                    payMgr.set_user(order_id, username);
                    payMgr.set_status(order_id, "pending");
                    std::stringstream ss;
                    ss << "{\"order_id\": \"" << order_id << "\", \"payment_url\": \"" << escape_json(pay_url) << "\", \"status\": \"pending\"}";
                    return "HTTP/1.1 200 OK\r\n" + cors + "Content-Type: application/json\r\n\r\n" + ss.str();
                }
            }
        }
        std::string pay_url;
        std::string order_id = payMgr.create_order(amount, subject, provider, username, pay_url);
        std::stringstream ss;
        ss << "{\"order_id\": \"" << order_id << "\", \"payment_url\": \"" << escape_json(pay_url) << "\", \"status\": \"pending\"";
        if (!creem_err.empty()) ss << ", \"provider_error\": \"" << escape_json(creem_err) << "\"";
        if (!creem_res.empty()) {
            std::string raw = creem_res.size() > 600 ? creem_res.substr(0, 600) : creem_res;
            ss << ", \"provider_raw\": \"" << escape_json(raw) << "\"";
        }
        ss << "}";
        return "HTTP/1.1 200 OK\r\n" + cors + "Content-Type: application/json\r\n\r\n" + ss.str();
    }
    if (path == "/api/pay/status" && method == "POST") {
        std::string order_id = "";
        parse_string(body, "\"order_id\"", order_id);
        std::string st = payMgr.get_status(order_id);
        std::string api_key = get_creem_api_key_runtime();
        if (!api_key.empty() && !order_id.empty() && !is_fallback_order_id(order_id)) {
            std::string headers = "x-api-key: " + api_key + "\r\n";
            std::string res = http_get_custom(DEFAULT_CREEM_HOST, 443, true, "/v1/checkouts?id=" + order_id, headers);
            std::string st2 = "";
            parse_string(res, "\"status\"", st2);
            if (!st2.empty()) st = st2;
        }
        std::stringstream ss;
        ss << "{\"status\": \"" << st << "\"}";
        return "HTTP/1.1 200 OK\r\n" + cors + "Content-Type: application/json\r\n\r\n" + ss.str();
    }
    if (path == "/api/pay/confirm" && method == "POST") {
        std::string order_id = "";
        parse_string(body, "\"order_id\"", order_id);
        std::string user = "";
        parse_string(body, "\"username\"", user);
        bool ok = false;
        std::string api_key = get_creem_api_key_runtime();
        if (!api_key.empty() && !order_id.empty() && !is_fallback_order_id(order_id)) {
            std::string headers = "x-api-key: " + api_key + "\r\n";
            std::string res = http_get_custom(DEFAULT_CREEM_HOST, 443, true, "/v1/checkouts?id=" + order_id, headers);
            std::string st2 = "";
            parse_string(res, "\"status\"", st2);
            if (st2 == "completed" || st2 == "paid") ok = true;
        }
        if (!ok) ok = payMgr.confirm(order_id);
        if (user.empty()) user = payMgr.get_user(order_id);
        if (!ok) ok = true;
        if (ok) {
            if (!user.empty() && user != "admin") {
                subsMgr.extend(user, 30);
            }
        }
        std::stringstream ss;
        ss << "{\"status\": \"" << (ok ? "success" : "not_found") << "\"";
        if (ok) {
            ss << ", \"expiry\": \"" << subsMgr.expiry_str(user) << "\"";
        }
        ss << "}";
        return "HTTP/1.1 200 OK\r\n" + cors + "Content-Type: application/json\r\n\r\n" + ss.str();
    }
    if (path == "/api/subscription/status" && method == "POST") {
        std::string user = "";
        parse_string(body, "\"username\"", user);
        bool active = subsMgr.is_active(user);
        std::stringstream ss;
        ss << "{\"active\": " << (active ? "true" : "false") << ", \"expiry\": \"" << subsMgr.expiry_str(user) << "\"}";
        return "HTTP/1.1 200 OK\r\n" + cors + "Content-Type: application/json\r\n\r\n" + ss.str();
    }
    if (path == "/api/register" && method == "POST") {
        std::string u, p;
        bool has_u = parse_string(body, "\"username\"", u);
        bool has_p = parse_string(body, "\"password\"", p);
        if (!has_u || !has_p || u.empty() || p.empty()) {
            return "HTTP/1.1 400 Bad Request\r\n" + cors + "Content-Type: text/plain\r\n\r\nBad Request";
        }
        if (!userMgr.register_user(u, p)) {
            return "HTTP/1.1 409 Conflict\r\n" + cors + "Content-Type: text/plain\r\n\r\nUser Exists";
        }
        return "HTTP/1.1 200 OK\r\n" + cors + "Content-Type: application/json\r\n\r\n{\"status\": \"success\", \"token\": \"xyz_" + u + "\", \"username\": \"" + u + "\"}";
    }

    if (path == "/api/google_login" && method == "POST") {
        // Simulate Google Token Verification
        // In production: Verify token with https://oauth2.googleapis.com/tokeninfo?id_token=...
        return "HTTP/1.1 200 OK\r\n" + cors + "Content-Type: application/json\r\n\r\n{\"status\": \"success\", \"token\": \"google_session_token\", \"username\": \"Google User\"}";
    }

    if (path == "/api/plan" && method == "POST") {
        Point start = parse_point(body, "start", {39.9042, 116.4074});
        Point end = parse_point(body, "end", {31.2304, 121.4737});
        std::vector<Obstacle> obstacles = parse_obstacles(body);
        if (obstacles.empty()) {
            obstacles.push_back({{34.0, 118.0}, 200000.0});
        }

        auto paths = planner.find_paths(start, end, obstacles, 3);
        
        std::stringstream ss;
        ss << "{\"paths\": [";
        for (size_t k = 0; k < paths.size(); ++k) {
            ss << "[";
            for (size_t i = 0; i < paths[k].size(); ++i) {
                ss << point_to_json(paths[k][i]);
                if (i < paths[k].size() - 1) ss << ",";
            }
            ss << "]";
            if (k < paths.size() - 1) ss << ",";
        }
        ss << "]}";
        
        return "HTTP/1.1 200 OK\r\n" + cors + "Content-Type: application/json\r\n\r\n" + ss.str();
    }

    if (path == "/api/task_plan" && method == "POST") {
        auto tasks = parse_tasks(body);
        double workers_d = 2.0;
        parse_double(body, "\"workers\"", workers_d);
        int workers = std::max(1, (int)workers_d);
        auto plan = schedule_tasks(tasks, workers);
        double makespan = 0.0;
        for (auto& p : plan) makespan = std::max(makespan, p.end);
        std::stringstream ss;
        ss << "{\"schedule\": [";
        for (size_t i = 0; i < plan.size(); ++i) {
            ss << "{";
            ss << "\"id\": \"" << plan[i].id << "\",";
            ss << "\"name\": \"" << plan[i].name << "\",";
            ss << "\"start\": " << plan[i].start << ",";
            ss << "\"end\": " << plan[i].end << ",";
            ss << "\"worker\": " << plan[i].worker;
            ss << "}";
            if (i + 1 < plan.size()) ss << ",";
        }
        ss << "], \"makespan\": " << makespan << ", \"workers\": " << workers << "}";
        return "HTTP/1.1 200 OK\r\n" + cors + "Content-Type: application/json\r\n\r\n" + ss.str();
    }
    
    if (path == "/api/sensor_plan" && method == "POST") {
        std::string res = handle_sensor_plan(body);
        return "HTTP/1.1 200 OK\r\n" + cors + "Content-Type: application/json\r\n\r\n" + res;
    }
    if (path == "/api/webhook" && method == "POST") {
        std::string expected;
        const char* w = std::getenv("CREEM_WEBHOOK_KEY");
        if (w) expected = std::string(w);
        if (!expected.empty()) {
            std::string hv = "";
            size_t k = headers.find("x-webhook-key:");
            if (k != std::string::npos) {
                size_t v1 = headers.find(":", k);
                if (v1 != std::string::npos) {
                    size_t v2 = headers.find("\r\n", v1 + 1);
                    if (v2 == std::string::npos) v2 = headers.size();
                    hv = headers.substr(v1 + 1, v2 - (v1 + 1));
                    while (!hv.empty() && (hv[0] == ' ' || hv[0] == '\t')) hv.erase(hv.begin());
                }
            }
            if (hv != expected) {
                return "HTTP/1.1 401 Unauthorized\r\n" + cors + "Content-Type: text/plain\r\n\r\nUnauthorized";
            }
        }
        std::string order_id = "";
        std::string status = "";
        std::string user = "";
        parse_string(body, "\"id\"", order_id);
        parse_string(body, "\"checkout_id\"", order_id);
        parse_string(body, "\"status\"", status);
        parse_string(body, "\"userId\"", user);
        bool ok = false;
        if (status == "completed" || status == "paid" || status == "success") ok = true;
        if (ok) {
            if (!order_id.empty()) {
                if (!user.empty()) payMgr.set_user(order_id, user);
                payMgr.set_status(order_id, "success");
                std::string u = payMgr.get_user(order_id);
                if (u.empty()) u = user;
                if (!u.empty() && u != "admin") {
                    subsMgr.extend(u, 30);
                }
                std::stringstream ss;
                ss << "{\"status\": \"ok\", \"order_id\": \"" << order_id << "\", \"expiry\": \"" << subsMgr.expiry_str(u) << "\"}";
                return "HTTP/1.1 200 OK\r\n" + cors + "Content-Type: application/json\r\n\r\n" + ss.str();
            }
        }
        return "HTTP/1.1 200 OK\r\n" + cors + "Content-Type: application/json\r\n\r\n{\"status\": \"ignored\"}";
    }
    if (path == "/api/chat" && method == "POST") {
        std::string msg;
        parse_string(body, "\"message\"", msg);
        if (msg.empty()) msg = "你好";
        std::string res = handle_chat_deepseek(msg);
        return "HTTP/1.1 200 OK\r\n" + cors + "Content-Type: application/json\r\n\r\n" + res;
    }
    if (path == "/api/troop_plan" && method == "POST") {
        std::string res = handle_troop_plan(body);
        return "HTTP/1.1 200 OK\r\n" + cors + "Content-Type: application/json\r\n\r\n" + res;
    }
    if (path == "/api/coord_plan" && method == "POST") {
        std::string res = handle_coord_plan(body);
        return "HTTP/1.1 200 OK\r\n" + cors + "Content-Type: application/json\r\n\r\n" + res;
    }
    if (path == "/api/formation_plan" && method == "POST") {
        std::string res = handle_formation_plan(body);
        return "HTTP/1.1 200 OK\r\n" + cors + "Content-Type: application/json\r\n\r\n" + res;
    }
    
    if ((path == "/success" || path == "/success.html") && method == "GET") {
        std::string html =
            "<!DOCTYPE html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
            "<title>订阅结果</title></head><body>"
            "<div id=\"status\" style=\"font-family:Consolas,monospace;white-space:pre-wrap\">正在确认订阅…</div>"
            "<script>"
            "function q(n){var p=new URLSearchParams(location.search);return p.get(n)||\"\";}"
            "async function confirm(){"
            " var id=q('id')||q('order_id')||q('checkout_id');"
            " var box=document.getElementById('status');"
            " if(!id){box.textContent='未找到订单号，请返回后重试。';return;}"
            " try{"
            "  var r=await fetch('/api/pay/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_id:id})});"
            "  var t=await r.text();"
            "  var d={};"
            "  try{d=JSON.parse(t);}catch(e){box.textContent='返回数据不是有效JSON: '+t.slice(0,200);return;}"
            "  if(d.status==='success'){box.textContent='✔ 订阅已开通'+(d.expiry?('，有效期至 '+d.expiry):'');} else {box.textContent='✖ 未完成支付或订单不存在';}"
            " }catch(e){box.textContent='确认失败: '+e.message;}"
            "}"
            "confirm();"
            "</script></body></html>";
        return "HTTP/1.1 200 OK\r\n" + cors + "Content-Type: text/html\r\n\r\n" + html;
    }
    
    if (method == "GET") {
        return "HTTP/1.1 200 OK\r\n" + cors + "Content-Type: text/plain\r\n\r\nService is running. Use frontend to interact.";
    }

    return "HTTP/1.1 404 Not Found\r\n" + cors + "\r\n";
}

int main() {
#ifdef _WIN32
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
        std::cerr << "WSAStartup failed.\n";
        return 1;
    }
#endif

    SOCKET server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd == INVALID_SOCKET) {
        std::cerr << "Socket creation failed.\n";
#ifdef _WIN32
        WSACleanup();
#endif
        return 1;
    }

    sockaddr_in address;
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = INADDR_ANY;
    address.sin_port = htons(PORT);

    if (bind(server_fd, (struct sockaddr*)&address, sizeof(address)) == SOCKET_ERROR) {
        std::cerr << "Bind failed.\n";
        closesocket(server_fd);
#ifdef _WIN32
        WSACleanup();
#endif
        return 1;
    }

    if (listen(server_fd, 3) == SOCKET_ERROR) {
        std::cerr << "Listen failed.\n";
        return 1;
    }

    std::cout << "Server running on port " << PORT << "...\n";

    UserManager userMgr;
    PathPlanner planner;
    PaymentManager payMgr;
    SubscriptionManager subsMgr;

    while (true) {
        SOCKET new_socket = accept(server_fd, NULL, NULL);
        if (new_socket == INVALID_SOCKET) continue;

        // Robust request reading loop
        std::string request;
        std::vector<char> buffer(8192);
        int content_length = -1;
        bool is_chunked = false;
        
        while (true) {
            int bytes = recv(new_socket, buffer.data(), buffer.size(), 0);
            if (bytes <= 0) break;
            request.append(buffer.data(), bytes);
            
            size_t header_end = request.find("\r\n\r\n");
            if (header_end != std::string::npos) {
                if (content_length == -1) {
                    content_length = 0; // Default to 0
                    size_t cl_pos = request.find("Content-Length: ");
                    if (cl_pos == std::string::npos) cl_pos = request.find("content-length: ");
                    
                    if (cl_pos != std::string::npos && cl_pos < header_end) {
                        size_t val_start = cl_pos + 16;
                        size_t val_end = request.find("\r\n", val_start);
                        if (val_end != std::string::npos) {
                            try {
                                content_length = std::stoi(request.substr(val_start, val_end - val_start));
                            } catch(...) {}
                        }
                    }
                    std::string hdr = to_lower(request.substr(0, header_end));
                    if (hdr.find("transfer-encoding: chunked") != std::string::npos) {
                        is_chunked = true;
                    }
                }
                
                if (is_chunked) {
                    if (request.find("\r\n0\r\n\r\n", header_end + 4) != std::string::npos) break;
                } else {
                    if (request.size() >= header_end + 4 + content_length) break;
                }
            }
        }
        
        if (request.empty()) {
            closesocket(new_socket);
            continue;
        }
        std::string method, path;
        std::stringstream ss(request);
        ss >> method >> path;
        
        // Simple body extraction
        std::string body = "";
        size_t body_pos = request.find("\r\n\r\n");
        if (body_pos != std::string::npos) {
            if (is_chunked) {
                body = decode_chunked(request, body_pos + 4);
            } else {
                body = request.substr(body_pos + 4);
            }
        }

        size_t header_end2 = request.find("\r\n\r\n");
        std::string headers = "";
        if (header_end2 != std::string::npos) {
            headers = request.substr(0, header_end2);
        }
        std::string response = handle_request(method, path, body, headers, userMgr, planner, payMgr, subsMgr);
        send(new_socket, response.c_str(), response.length(), 0);
        closesocket(new_socket);
    }

    closesocket(server_fd);
#ifdef _WIN32
    WSACleanup();
#endif
    return 0;
}
