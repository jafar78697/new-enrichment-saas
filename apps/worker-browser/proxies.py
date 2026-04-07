import random
import os

def get_proxy_list():
    raw = os.getenv("PROXY_LIST", "")
    if not raw:
        return []
    return [p.strip() for p in raw.split(",") if p.strip()]

def get_random_proxy():
    proxies = get_proxy_list()
    if not proxies:
        return None
    
    proxy = random.choice(proxies)
    return {
        "server": proxy,
    }
