#ifndef PATH_PLANNER_HPP
#define PATH_PLANNER_HPP

#include <vector>
#include <cmath>
#include <algorithm>
#include <queue>
#include <map>
#include <iostream>
#include <set>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

struct Point {
    double lat;
    double lon;
    
    bool operator==(const Point& other) const {
        return std::abs(lat - other.lat) < 1e-9 && std::abs(lon - other.lon) < 1e-9;
    }
};

struct Obstacle {
    Point center;
    double radius; // meters
};

class PathPlanner {
private:
    const double EARTH_RADIUS = 6371000.0;

    double toRadians(double deg) {
        return deg * M_PI / 180.0;
    }

    double toDegrees(double rad) {
        return rad * 180.0 / M_PI;
    }

    double haversine_distance(Point p1, Point p2) {
        double d_lat = toRadians(p2.lat - p1.lat);
        double d_lon = toRadians(p2.lon - p1.lon);
        double lat1 = toRadians(p1.lat);
        double lat2 = toRadians(p2.lat);

        double a = std::sin(d_lat / 2) * std::sin(d_lat / 2) +
                   std::cos(lat1) * std::cos(lat2) *
                   std::sin(d_lon / 2) * std::sin(d_lon / 2);
        double c = 2 * std::atan2(std::sqrt(a), std::sqrt(1 - a));
        return EARTH_RADIUS * c;
    }

    double calculate_bearing(Point p1, Point p2) {
        double lat1 = toRadians(p1.lat);
        double lat2 = toRadians(p2.lat);
        double d_lon = toRadians(p2.lon - p1.lon);

        double y = std::sin(d_lon) * std::cos(lat2);
        double x = std::cos(lat1) * std::sin(lat2) -
                   std::sin(lat1) * std::cos(lat2) * std::cos(d_lon);
        return std::atan2(y, x);
    }

    Point get_destination_point(Point p, double distance, double bearing) {
        double lat1 = toRadians(p.lat);
        double lon1 = toRadians(p.lon);
        double ang_dist = distance / EARTH_RADIUS;

        double lat2 = std::asin(std::sin(lat1) * std::cos(ang_dist) +
                                std::cos(lat1) * std::sin(ang_dist) * std::cos(bearing));
        double lon2 = lon1 + std::atan2(std::sin(bearing) * std::sin(ang_dist) * std::cos(lat1),
                                        std::cos(ang_dist) - std::sin(lat1) * std::sin(lat2));
        return {toDegrees(lat2), toDegrees(lon2)};
    }

    double cross_track_distance(Point start, Point end, Point point) {
        double d13 = haversine_distance(start, point) / EARTH_RADIUS;
        double theta13 = calculate_bearing(start, point);
        double theta12 = calculate_bearing(start, end);
        return std::abs(std::asin(std::sin(d13) * std::sin(theta13 - theta12))) * EARTH_RADIUS;
    }

    bool is_segment_blocked(Point p1, Point p2, const std::vector<Obstacle>& obstacles) {
        for (const auto& obs : obstacles) {
            double lat0 = toRadians(obs.center.lat);
            double x1 = EARTH_RADIUS * std::cos(lat0) * toRadians(p1.lon - obs.center.lon);
            double y1 = EARTH_RADIUS * toRadians(p1.lat - obs.center.lat);
            double x2 = EARTH_RADIUS * std::cos(lat0) * toRadians(p2.lon - obs.center.lon);
            double y2 = EARTH_RADIUS * toRadians(p2.lat - obs.center.lat);

            double dx = x2 - x1;
            double dy = y2 - y1;
            double denom = dx * dx + dy * dy;
            if (denom == 0.0) continue;

            double t = -(x1 * dx + y1 * dy) / denom;
            if (t < 0.0) t = 0.0;
            if (t > 1.0) t = 1.0;
            double cx = x1 + t * dx;
            double cy = y1 + t * dy;
            double dist = std::sqrt(cx * cx + cy * cy);
            if (dist <= obs.radius - 0.5) {
                return true;
            }

            double d1 = std::sqrt(x1 * x1 + y1 * y1);
            double d2 = std::sqrt(x2 * x2 + y2 * y2);
            if (d1 <= obs.radius - 0.5 || d2 <= obs.radius - 0.5) {
                return true;
            }
        }
        return false;
    }

    long long edge_key(int a, int b) {
        if (a > b) std::swap(a, b);
        return (static_cast<long long>(a) << 32) | static_cast<long long>(b);
    }

    std::vector<int> dijkstra_with_ban(const std::vector<std::vector<std::pair<int, double>>>& adj, int s, int t, const std::set<long long>& banned) {
        int n = adj.size();
        std::priority_queue<std::pair<double, int>, std::vector<std::pair<double, int>>, std::greater<std::pair<double, int>>> pq;
        std::vector<double> dist(n, 1e18);
        std::vector<int> parent(n, -1);
        dist[s] = 0.0;
        pq.push({0.0, s});
        while (!pq.empty()) {
            auto top = pq.top();
            pq.pop();
            double d = top.first;
            int u = top.second;
            if (d > dist[u]) continue;
            if (u == t) break;
            for (auto& e : adj[u]) {
                int v = e.first;
                double w = e.second;
                if (banned.count(edge_key(u, v))) continue;
                if (dist[u] + w < dist[v]) {
                    dist[v] = dist[u] + w;
                    parent[v] = u;
                    pq.push({dist[v], v});
                }
            }
        }
        std::vector<int> path_idx;
        if (parent[t] != -1 || s == t) {
            int cur = t;
            while (cur != -1) {
                path_idx.push_back(cur);
                cur = parent[cur];
            }
            std::reverse(path_idx.begin(), path_idx.end());
        }
        return path_idx;
    }

    bool same_seq(const std::vector<int>& a, const std::vector<int>& b) {
        if (a.size() != b.size()) return false;
        for (size_t i = 0; i < a.size(); ++i) if (a[i] != b[i]) return false;
        return true;
    }

public:
    std::vector<std::vector<Point>> find_paths(Point start, Point end, const std::vector<Obstacle>& obstacles, int k = 3) {
        std::vector<Point> nodes;
        nodes.push_back(start);
        nodes.push_back(end);

        for (const auto& obs : obstacles) {
            double r_buffered = obs.radius * 1.02;
            int points_per_obstacle = 32;
            double step_angle = 2 * M_PI / points_per_obstacle;

            for (int i = 0; i < points_per_obstacle; ++i) {
                nodes.push_back(get_destination_point(obs.center, r_buffered, i * step_angle));
            }
        }

        int n = nodes.size();
        std::vector<std::vector<std::pair<int, double>>> adj(n);

        for (int i = 0; i < n; ++i) {
            for (int j = i + 1; j < n; ++j) {
                if (!is_segment_blocked(nodes[i], nodes[j], obstacles)) {
                    double d = haversine_distance(nodes[i], nodes[j]);
                    adj[i].push_back({j, d});
                    adj[j].push_back({i, d});
                }
            }
        }

        std::vector<std::vector<Point>> result_paths;
        std::vector<std::vector<int>> idx_paths;
        std::set<long long> banned;
        auto p0 = dijkstra_with_ban(adj, 0, 1, banned);
        if (!p0.empty()) idx_paths.push_back(p0);

        for (int i = 0; i < (int)idx_paths.size() && (int)result_paths.size() < k; ++i) {
            const auto& cur = idx_paths[i];
            std::vector<Point> rp;
            for (int id : cur) rp.push_back(nodes[id]);
            if (rp.empty()) {
                rp.push_back(start);
                rp.push_back(end);
            }
            result_paths.push_back(rp);
            if ((int)result_paths.size() >= k) break;

            for (size_t j = 0; j + 1 < cur.size() && (int)idx_paths.size() < k; ++j) {
                std::set<long long> banned2 = banned;
                banned2.insert(edge_key(cur[j], cur[j + 1]));
                auto alt = dijkstra_with_ban(adj, 0, 1, banned2);
                bool dup = false;
                for (auto& s : idx_paths) if (same_seq(s, alt)) { dup = true; break; }
                if (!alt.empty() && !dup) idx_paths.push_back(alt);
            }
        }
        if (result_paths.empty()) {
            result_paths.push_back({start, end});
        }
        return result_paths;
    }

    std::vector<Point> find_path(Point start, Point end, const std::vector<Obstacle>& obstacles) {
        auto paths = find_paths(start, end, obstacles, 1);
        return paths.empty() ? std::vector<Point>{start, end} : paths[0];
    }
};

#endif // PATH_PLANNER_HPP
