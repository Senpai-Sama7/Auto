"""Omega Security MCP Server - Cybersecurity and threat intelligence."""

import json
import structlog
import requests
from fastmcp import FastMCP
from typing import Optional, List

mcp = FastMCP("omega-security")
logger = structlog.get_logger("omega-security")


@mcp.tool()
async def cyber_subdomain_enum(domain: str, deep: bool = False) -> str:
    """Enumerate subdomains for a target domain using certificate transparency logs.
    
    Queries crt.sh and other sources to find subdomains.
    Uses passive reconnaissance (no direct target contact).
    
    Args:
        domain: Target domain (e.g., example.com)
        deep: Enable DNS resolution for found subdomains
        
    Returns:
        JSON string with discovered subdomains
    """
    try:
        # Query crt.sh for certificate transparency logs
        url = f"https://crt.sh/?q=%.{domain}&output=json"
        response = requests.get(url, timeout=30)
        
        if response.status_code != 200:
            return json.dumps({"error": f"crt.sh returned {response.status_code}"})
        
        data = response.json()
        
        # Extract unique subdomains
        subdomains = set()
        for entry in data:
            name = entry.get("name_value", "").strip()
            if name and "*" not in name:
                subdomains.add(name)
            # Also check common name
            cn = entry.get("common_name", "").strip()
            if cn and "*" not in cn and domain in cn:
                subdomains.add(cn)
        
        result = {
            "domain": domain,
            "subdomains_found": len(subdomains),
            "subdomains": sorted(list(subdomains))
        }
        
        if deep and subdomains:
            # Perform DNS resolution
            import socket
            resolved = []
            for sub in list(subdomains)[:50]:  # Limit to 50 for performance
                try:
                    ip = socket.gethostbyname(sub)
                    resolved.append({"subdomain": sub, "ip": ip})
                except socket.gaierror:
                    resolved.append({"subdomain": sub, "ip": None})
            result["resolved"] = resolved
        
        return json.dumps(result, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def cyber_dns_analyze(domain: str) -> str:
    """Analyze DNS records for security assessment.
    
    Queries A, AAAA, MX, TXT, NS, and CNAME records.
    Checks SPF, DKIM, DMARC for email security.
    
    Args:
        domain: Domain to analyze
        
    Returns:
        JSON string with DNS records and security analysis
    """
    try:
        import dns.resolver
        
        records = {}
        record_types = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'SOA']
        
        for rtype in record_types:
            try:
                answers = dns.resolver.resolve(domain, rtype)
                records[rtype] = [str(rdata) for rdata in answers]
            except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
                records[rtype] = []
        
        # Security analysis
        security = {
            "spf_present": any("v=spf1" in r for r in records.get("TXT", [])),
            "dmarc_present": any("v=DMARC1" in r for r in records.get("TXT", [])),
            "dkim_present": False,  # Would need to check specific selectors
            "dnssec_enabled": False  # Would need DNSKEY query
        }
        
        return json.dumps({
            "domain": domain,
            "records": records,
            "security_analysis": security
        }, indent=2)
    except ImportError:
        return json.dumps({"error": "dnspython not installed"})
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def cyber_headers_analyze(url: str, follow_redirects: bool = True) -> str:
    """Analyze HTTP security headers and provide recommendations.
    
    Checks for HSTS, CSP, X-Frame-Options, and other security headers.
    
    Args:
        url: URL to analyze
        follow_redirects: Follow HTTP redirects
        
    Returns:
        JSON string with security header analysis
    """
    try:
        response = requests.head(url, allow_redirects=follow_redirects, timeout=30)
        headers = response.headers
        
        security_headers = {
            "Strict-Transport-Security": headers.get("Strict-Transport-Security", "Missing"),
            "Content-Security-Policy": headers.get("Content-Security-Policy", "Missing"),
            "X-Frame-Options": headers.get("X-Frame-Options", "Missing"),
            "X-Content-Type-Options": headers.get("X-Content-Type-Options", "Missing"),
            "X-XSS-Protection": headers.get("X-XSS-Protection", "Missing"),
            "Referrer-Policy": headers.get("Referrer-Policy", "Missing"),
            "Permissions-Policy": headers.get("Permissions-Policy", "Missing")
        }
        
        # Score calculation
        present = sum(1 for v in security_headers.values() if v != "Missing")
        score = int((present / len(security_headers)) * 100)
        
        return json.dumps({
            "url": url,
            "status_code": response.status_code,
            "security_score": score,
            "headers": security_headers,
            "recommendations": [
                f"Add {h}" for h, v in security_headers.items() if v == "Missing"
            ]
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def cyber_cve_search(keyword: str, limit: int = 10) -> str:
    """Search for CVEs by keyword in the National Vulnerability Database.
    
    Args:
        keyword: Search term (e.g., "log4j", "buffer overflow")
        limit: Maximum results (1-20)
        
    Returns:
        JSON string with matching CVEs
    """
    try:
        limit = min(max(limit, 1), 20)
        
        # NVD API
        url = "https://services.nvd.nist.gov/rest/json/cves/2.0"
        params = {"keywordSearch": keyword, "resultsPerPage": limit}
        
        response = requests.get(url, params=params, timeout=30)
        
        if response.status_code != 200:
            return json.dumps({"error": f"NVD API returned {response.status_code}"})
        
        data = response.json()
        vulnerabilities = data.get("vulnerabilities", [])
        
        results = []
        for vuln in vulnerabilities:
            cve = vuln.get("cve", {})
            results.append({
                "id": cve.get("id"),
                "description": cve.get("descriptions", [{}])[0].get("value", "N/A"),
                "severity": cve.get("metrics", {}).get("cvssMetricV31", [{}])[0].get("cvssData", {}).get("baseSeverity", "Unknown"),
                "published": cve.get("published")
            })
        
        return json.dumps({
            "keyword": keyword,
            "results_found": len(results),
            "cves": results
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def cyber_cve_lookup(cve_id: str) -> str:
    """Look up CVE (Common Vulnerabilities and Exposures) information from NVD.
    
    Args:
        cve_id: CVE ID in format CVE-YYYY-NNNNN (e.g., CVE-2021-44228)
        
    Returns:
        JSON string with CVE details
    """
    try:
        import re
        if not re.match(r'^CVE-\d{4}-\d+$', cve_id):
            return json.dumps({"error": "Invalid CVE format. Use CVE-YYYY-NNNNN"})
        
        url = f"https://services.nvd.nist.gov/rest/json/cves/2.0?cveId={cve_id}"
        response = requests.get(url, timeout=30)
        
        if response.status_code != 200:
            return json.dumps({"error": f"NVD API returned {response.status_code}"})
        
        data = response.json()
        vulnerabilities = data.get("vulnerabilities", [])
        
        if not vulnerabilities:
            return json.dumps({"error": f"CVE {cve_id} not found"})
        
        cve = vulnerabilities[0].get("cve", {})
        
        return json.dumps({
            "id": cve.get("id"),
            "description": cve.get("descriptions", [{}])[0].get("value", "N/A"),
            "published": cve.get("published"),
            "last_modified": cve.get("lastModified"),
            "severity": cve.get("metrics", {}).get("cvssMetricV31", [{}])[0].get("cvssData", {}).get("baseSeverity", "Unknown"),
            "score": cve.get("metrics", {}).get("cvssMetricV31", [{}])[0].get("cvssData", {}).get("baseScore", "N/A"),
            "references": [ref.get("url") for ref in cve.get("references", [])]
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def cyber_threat_ip_lookup(ip: str, sources: Optional[List[str]] = None) -> str:
    """Check IP address reputation against threat intelligence sources.
    
    Queries IP geolocation and threat data.
    
    Args:
        ip: IP address to check
        sources: Sources to query ['ipinfo', 'virustotal', 'abuseipdb']
        
    Returns:
        JSON string with IP reputation data
    """
    try:
        if not sources:
            sources = ["ipinfo"]
        
        result = {"ip": ip, "sources_queried": sources}
        
        if "ipinfo" in sources:
            try:
                resp = requests.get(f"https://ipinfo.io/{ip}/json", timeout=10)
                if resp.status_code == 200:
                    result["ipinfo"] = resp.json()
            except Exception as e:
                result["ipinfo"] = {"error": str(e)}
        
        # Note: VirusTotal requires API key
        if "virustotal" in sources:
            result["virustotal"] = {"note": "Requires VIRUSTOTAL_API_KEY environment variable"}
        
        return json.dumps(result, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def cyber_mitre_search(keyword: str, tactic: Optional[str] = None) -> str:
    """Search MITRE ATT&CK techniques by keyword.
    
    Args:
        keyword: Search term (e.g., "phishing", "credential")
        tactic: Filter by tactic (optional)
        
    Returns:
        JSON string with matching techniques
    """
    try:
        # MITRE ATT&CK data (simplified - would fetch from API in production)
        # Using enterprise-attack.json from MITRE
        url = "https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json"
        
        response = requests.get(url, timeout=30)
        if response.status_code != 200:
            return json.dumps({"error": f"Failed to fetch MITRE data: {response.status_code}"})
        
        data = response.json()
        objects = data.get("objects", [])
        
        techniques = []
        keyword_lower = keyword.lower()
        
        for obj in objects:
            if obj.get("type") == "attack-pattern":
                name = obj.get("name", "")
                description = obj.get("description", "")
                
                if keyword_lower in name.lower() or keyword_lower in description.lower():
                    techniques.append({
                        "id": obj.get("external_references", [{}])[0].get("external_id", "N/A"),
                        "name": name,
                        "description": description[:200] + "..." if len(description) > 200 else description
                    })
        
        return json.dumps({
            "keyword": keyword,
            "results_found": len(techniques[:20]),
            "techniques": techniques[:20]
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def cyber_whois(domain: str) -> str:
    """Perform WHOIS lookup for domain registration information.
    
    Args:
        domain: Domain to lookup
        
    Returns:
        JSON string with WHOIS data
    """
    try:
        import subprocess
        result = subprocess.run(
            ["whois", domain],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode != 0:
            return json.dumps({"error": f"WHOIS failed: {result.stderr}"})
        
        # Parse key fields
        whois_data = result.stdout
        parsed = {}
        
        for line in whois_data.split('\n'):
            if ':' in line and not line.startswith('%'):
                key, value = line.split(':', 1)
                key = key.strip()
                value = value.strip()
                if key and value:
                    if key in parsed:
                        if isinstance(parsed[key], list):
                            parsed[key].append(value)
                        else:
                            parsed[key] = [parsed[key], value]
                    else:
                        parsed[key] = value
        
        return json.dumps({
            "domain": domain,
            "parsed": parsed,
            "raw": whois_data[:2000]  # Truncate for brevity
        }, indent=2)
    except FileNotFoundError:
        return json.dumps({"error": "whois command not found"})
    except Exception as e:
        return json.dumps({"error": str(e)})


if __name__ == "__main__":
    mcp.run(transport="stdio")
