# 🚨 EC2 INSTANCE BAND HO GAYI HAI!

## ❌ **CURRENT STATUS:**

```bash
ping 54.91.39.13
# Result: 100% packet loss
```

**EC2 Instance (54.91.39.13) accessible NAHI hai!**

---

## 🔍 **POSSIBLE REASONS:**

1. **EC2 Instance STOPPED** (most likely)
2. **EC2 Instance TERMINATED** (deleted)
3. **Security Group changed** (port blocked)
4. **Elastic IP disassociated**
5. **AWS Account billing issue**

---

## ✅ **SOLUTION - Step by Step:**

### **Step 1: AWS Console Login**

```
1. Go to: https://aws.amazon.com/console/
2. Click "Sign In to Console"
3. Enter your AWS account credentials
```

### **Step 2: Go to EC2 Dashboard**

```
1. Search "EC2" in top search bar
2. Click "EC2" under Services
3. Make sure you're in correct region (top-right corner)
   - Likely: US East (N. Virginia) us-east-1
```

### **Step 3: Find Your Instance**

```
1. Click "Instances" in left sidebar
2. Look for instance with IP: 54.91.39.13
3. Check "Instance state" column:
   ✅ Running - Should be accessible
   ⏹️ Stopped - Need to start
   ❌ Terminated - Deleted (can't recover)
```

### **Step 4: If STOPPED - Start It**

```
1. Select the instance (checkbox)
2. Click "Instance state" button (top)
3. Click "Start instance"
4. Wait 2-3 minutes
5. Check if Public IP is still: 54.91.39.13
```

**IMPORTANT:** 
- If using **Elastic IP**, IP will stay same
- If NOT using Elastic IP, IP might CHANGE
- If IP changed, update Cloudflare DNS

### **Step 5: SSH Into EC2**

```bash
# From your local machine:
ssh -i ~/Downloads/enrichment-key.pem ubuntu@54.91.39.13

# If connection successful:
echo "✅ EC2 is running!"
```

### **Step 6: Check Services**

```bash
# On EC2 server:

# Check if API is running
pm2 status

# If not running, start it:
pm2 start enrichment-api
pm2 save

# Check logs if crashing:
pm2 logs enrichment-api

# Check PostgreSQL
sudo systemctl status postgresql

# If not running:
sudo systemctl start postgresql

# Check Nginx
sudo systemctl status nginx

# If not running:
sudo systemctl start nginx
```

### **Step 7: Test API**

```bash
# On EC2 (local test):
curl http://localhost:3000/health

# Should return:
{"status":"ok","timestamp":"..."}
```

### **Step 8: Test from Local Machine**

```bash
# From your laptop:
curl https://api.jentoai.pro/health

# Should return:
{"status":"ok"}
```

---

## 🔧 **If IP Address Changed:**

If EC2 started but has NEW IP:

### **Option A: Update Cloudflare DNS**

```
1. Go to: https://dash.cloudflare.com
2. Select your domain: jentoai.pro
3. Click "DNS"
4. Find record: api.jentoai.pro
5. Edit IP address to new EC2 IP
6. Save
7. Wait 1-2 minutes
```

### **Option B: Use Elastic IP (Recommended)**

```
1. AWS Console → EC2 → Elastic IPs
2. Allocate new Elastic IP (if don't have)
3. Associate with your instance
4. Update Cloudflare DNS to Elastic IP
5. Now IP won't change on stop/start
```

---

## 🚨 **If Instance TERMINATED:**

If instance shows "Terminated" status:

```
❌ Can't recover terminated instance
✅ Need to create NEW EC2 instance
✅ Redeploy everything
```

### **Re-deployment Steps:**

```bash
# 1. Create new EC2 instance
#    - Ubuntu 22.04
#    - t3.medium or t3.small
#    - Create/download new .pem key
#    - Assign Elastic IP

# 2. Run deployment script:
cd "/home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas-aws"

# Update deploy-to-ec2.sh with new IP and key
nano deploy-to-ec2.sh

# Run deployment:
bash deploy-to-ec2.sh
```

---

## 📊 **Checklist:**

### **AWS Console:**
- [ ] Login to AWS Console
- [ ] Go to EC2 Dashboard
- [ ] Find instance (54.91.39.13)
- [ ] Check instance state
- [ ] If stopped → Start it
- [ ] If terminated → Create new

### **After Starting:**
- [ ] Note Public IP address
- [ ] SSH into EC2
- [ ] Check PM2 status
- [ ] Start API if needed
- [ ] Check PostgreSQL
- [ ] Check Nginx
- [ ] Test API locally
- [ ] Test API from outside

### **If IP Changed:**
- [ ] Update Cloudflare DNS
- [ ] Update deploy-to-ec2.sh
- [ ] Wait for DNS propagation
- [ ] Test again

---

## 💡 **Quick Commands Summary:**

```bash
# Check if EC2 is up:
ping 54.91.39.13

# SSH into EC2:
ssh -i ~/Downloads/enrichment-key.pem ubuntu@54.91.39.13

# Check services:
pm2 status
sudo systemctl status postgresql
sudo systemctl status nginx

# Start services:
pm2 start enrichment-api
sudo systemctl start postgresql
sudo systemctl start nginx

# Test API:
curl http://localhost:3000/health
```

---

## ⚠️ **IMPORTANT NOTES:**

1. **Billing Check:**
   - AWS account mein credits/billing check karo
   - Agar bill pending hai, instance stop ho sakti hai

2. **Auto-Stop:**
   - Kuch AWS accounts me instances auto-stop ho jati hain
   - Check if you have any auto-stop rules

3. **Data Safety:**
   - Agar instance STOPPED hai → Data safe hai
   - Agar instance TERMINATED hai → Data lost (unless EBS backup)

4. **Elastic IP:**
   - Future me Elastic IP use karo
   - IP change nahi hoga

---

## 🎯 **IMMEDIATE ACTION:**

```
1. AWS Console login karo
2. EC2 instance dhundho
3. Check karo: Running ya Stopped?
4. If Stopped → Start karo
5. SSH karo aur services check karo
6. API start karo if needed
```

---

**EC2 instance start karo, sab wapis chal padega!** 🚀
