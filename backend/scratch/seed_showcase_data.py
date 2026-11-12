import os
import django
from django.utils import timezone

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
from saas.models import SaaSSubscription
from organisation.models import Organisation
from tables.models import IDCardTable, IDCard
from reprint.models import ReprintRequest

User = get_user_model()

print("--> Creating showcase subscription: Shree ID Cards & Printing Press...")
sub, created = SaaSSubscription.objects.get_or_create(
    slug='shree-id-cards',
    defaults={
        'name': 'Shree ID Cards & Printing Press',
        'tier': 'pro',
        'status': 'active',
        'license_key': 'CF-PRO-2026-SHRE-9882-7499',
        'license_status': 'active',
        'max_super_admins': 3,
        'max_organisations': 500,
        'max_cards': 10000,
        'custom_domain': 'portal.shreeidcards.in',
        'custom_subdomain': 'shreecards',
        'brand_name': 'Shree ID Cards',
        'panel_color_theme': '#2563eb',
        'panel_accent_theme': '#1d4ed8',
        'website_template': 'executive_navy',
        'notes': 'Regional Exclusive ID Card Manufacturer & Government Smart Card Contractor for Gujarat Region.',
    }
)
if not created:
    sub.name = 'Shree ID Cards & Printing Press'
    sub.tier = 'pro'
    sub.status = 'active'
    sub.license_key = 'CF-PRO-2026-SHRE-9882-7499'
    sub.license_status = 'active'
    sub.custom_domain = 'portal.shreeidcards.in'
    sub.custom_subdomain = 'shreecards'
    sub.brand_name = 'Shree ID Cards'
    sub.panel_color_theme = '#2563eb'
    sub.panel_accent_theme = '#1d4ed8'
    sub.save()

print(f"Subscription: {sub.name} (ID: {sub.id}, Tier: {sub.tier})")

# 2. Super Admin User
print("--> Creating/updating Super Admin user: shree_admin...")
shree_admin, admin_created = User.objects.get_or_create(
    username='shree_admin',
    defaults={
        'email': 'admin@shreeidcards.in',
        'first_name': 'Rajesh',
        'last_name': 'Patel',
        'role': 'super_admin',
        'subscription': sub,
        'phone': '+91 98250 12345',
        'is_active': True,
    }
)
shree_admin.set_password('Password@123')
shree_admin.role = 'super_admin'
shree_admin.subscription = sub
shree_admin.is_active = True
shree_admin.save()
print(f"Super Admin: {shree_admin.username} (Password: Password@123)")

# 3. Create Sample Client Organisations
print("--> Creating client organisations...")

# DPS
dps_mgr, _ = User.objects.get_or_create(
    username='dps_principal',
    defaults={
        'email': 'principal@dpsahmedabad.edu',
        'first_name': 'Dr. Sunita',
        'last_name': 'Sharma',
        'role': 'prime_manager',
        'subscription': sub,
        'is_active': True,
    }
)
dps_mgr.set_password('Password@123')
dps_mgr.save()

dps_org, _ = Organisation.objects.get_or_create(
    name='Delhi Public School, Sector 4',
    defaults={
        'owner': shree_admin,
        'subscription': sub,
        'user': dps_mgr,
        'image_folder_code': 'DPS04',
        'city': 'Ahmedabad',
        'state': 'Gujarat',
        'pincode': '380015',
        'status': 'active',
    }
)
dps_org.owner = shree_admin
dps_org.subscription = sub
dps_org.user = dps_mgr
dps_org.save()

# St. Xavier's
stxav_mgr, _ = User.objects.get_or_create(
    username='stxav_admin',
    defaults={
        'email': 'admin@stxaviersgandhinagar.org',
        'first_name': 'Father',
        'last_name': 'Thomas',
        'role': 'prime_manager',
        'subscription': sub,
        'is_active': True,
    }
)
stxav_mgr.set_password('Password@123')
stxav_mgr.save()

stxav_org, _ = Organisation.objects.get_or_create(
    name="St. Xavier's High School",
    defaults={
        'owner': shree_admin,
        'subscription': sub,
        'user': stxav_mgr,
        'image_folder_code': 'STXAV',
        'city': 'Gandhinagar',
        'state': 'Gujarat',
        'pincode': '382010',
        'status': 'active',
    }
)
stxav_org.owner = shree_admin
stxav_org.subscription = sub
stxav_org.user = stxav_mgr
stxav_org.save()

# Apex International
apex_mgr, _ = User.objects.get_or_create(
    username='apex_coordinator',
    defaults={
        'email': 'coordinator@apexintl.ac.in',
        'first_name': 'Vikram',
        'last_name': 'Mehta',
        'role': 'prime_manager',
        'subscription': sub,
        'is_active': True,
    }
)
apex_mgr.set_password('Password@123')
apex_mgr.save()

apex_org, _ = Organisation.objects.get_or_create(
    name="Apex International Academy",
    defaults={
        'owner': shree_admin,
        'subscription': sub,
        'user': apex_mgr,
        'image_folder_code': 'APEX01',
        'city': 'Vadodara',
        'state': 'Gujarat',
        'pincode': '390001',
        'status': 'active',
    }
)
apex_org.owner = shree_admin
apex_org.subscription = sub
apex_org.user = apex_mgr
apex_org.save()

# 4. Tables and Cards for DPS
print("--> Creating tables and ID cards for DPS...")
dps_fields = [
    {'name': 'Full Name', 'key': 'name', 'type': 'text', 'required': True},
    {'name': 'Roll No', 'key': 'roll_no', 'type': 'text', 'required': True},
    {'name': 'Class & Sec', 'key': 'class', 'type': 'text', 'required': True},
    {'name': 'Father Name', 'key': 'father_name', 'type': 'text', 'required': True},
    {'name': 'Blood Group', 'key': 'blood_group', 'type': 'text', 'required': True},
    {'name': 'Emergency Contact', 'key': 'phone', 'type': 'phone', 'required': True},
    {'name': 'Date of Birth', 'key': 'dob', 'type': 'date', 'required': True},
    {'name': 'Bus Route No', 'key': 'bus_route', 'type': 'text', 'required': False},
    {'name': 'Address', 'key': 'address', 'type': 'text', 'required': False},
]

table1, _ = IDCardTable.objects.get_or_create(
    organisation=dps_org,
    name='Grade 10 - Batch 2026-27 (Secondary)',
    defaults={
        'description': 'Class X secondary students complete photo ID card verification & print batch.',
        'table_type': 'student',
        'fields': dps_fields,
        'is_active': True,
    }
)

students_data = [
    {'name': 'Aarav Sharma', 'roll_no': '101', 'class': 'X-A', 'father_name': 'Sanjay Sharma', 'blood_group': 'O+', 'phone': '9825101001', 'dob': '2011-04-12', 'bus_route': 'Route 04', 'address': '12 Bodakdev, SG Highway', 'status': 'confirm'},
    {'name': 'Ananya Patel', 'roll_no': '102', 'class': 'X-A', 'father_name': 'Kirit Patel', 'blood_group': 'B+', 'phone': '9825101002', 'dob': '2011-08-25', 'bus_route': 'Route 07', 'address': '45 Vastrapur Lake Enclave', 'status': 'confirm'},
    {'name': 'Rohan Damor', 'roll_no': '103', 'class': 'X-A', 'father_name': 'Mahesh Damor', 'blood_group': 'A+', 'phone': '9825101003', 'dob': '2011-02-14', 'bus_route': 'Route 04', 'address': '78 Prahladnagar Garden Rd', 'status': 'confirm'},
    {'name': 'Diya Shah', 'roll_no': '104', 'class': 'X-A', 'father_name': 'Nirav Shah', 'blood_group': 'AB+', 'phone': '9825101004', 'dob': '2011-11-03', 'bus_route': 'Self Transport', 'address': '102 Navrangpura Heights', 'status': 'confirm'},
    {'name': 'Kabir Joshi', 'roll_no': '105', 'class': 'X-A', 'father_name': 'Hemant Joshi', 'blood_group': 'O-', 'phone': '9825101005', 'dob': '2011-06-19', 'bus_route': 'Route 02', 'address': '33 Paldi Cross Roads', 'status': 'confirm'},
    {'name': 'Meera Desai', 'roll_no': '106', 'class': 'X-A', 'father_name': 'Chirag Desai', 'blood_group': 'B+', 'phone': '9825101006', 'dob': '2011-09-30', 'bus_route': 'Route 09', 'address': '54 Satellite Road', 'status': 'confirm'},
    {'name': 'Devansh Trivedi', 'roll_no': '107', 'class': 'X-A', 'father_name': 'Pravin Trivedi', 'blood_group': 'A-', 'phone': '9825101007', 'dob': '2011-01-22', 'bus_route': 'Route 11', 'address': '19 Ghatlodia Sector 2', 'status': 'confirm'},
    {'name': 'Isha Choksi', 'roll_no': '108', 'class': 'X-A', 'father_name': 'Pankaj Choksi', 'blood_group': 'O+', 'phone': '9825101008', 'dob': '2011-07-11', 'bus_route': 'Route 03', 'address': '88 Thaltej Shilaj Road', 'status': 'confirm'},
    {'name': 'Vivaan Mehta', 'roll_no': '109', 'class': 'X-B', 'father_name': 'Saurabh Mehta', 'blood_group': 'B-', 'phone': '9825101009', 'dob': '2011-05-16', 'bus_route': 'Route 05', 'address': '67 Memnagar Lake View', 'status': 'request'},
    {'name': 'Pari Parikh', 'roll_no': '110', 'class': 'X-B', 'father_name': 'Rajiv Parikh', 'blood_group': 'AB-', 'phone': '9825101010', 'dob': '2011-12-08', 'bus_route': 'Route 08', 'address': '22 Drive-in Cinema Road', 'status': 'request'},
    {'name': 'Reyansh Vora', 'roll_no': '111', 'class': 'X-B', 'father_name': 'Ashwin Vora', 'blood_group': 'O+', 'phone': '9825101011', 'dob': '2011-03-27', 'bus_route': 'Route 01', 'address': '41 Ellisbridge Riverside', 'status': 'request'},
    {'name': 'Kavya Bhatt', 'roll_no': '112', 'class': 'X-B', 'father_name': 'Dharmesh Bhatt', 'blood_group': 'A+', 'phone': '9825101012', 'dob': '2011-10-05', 'bus_route': 'Route 06', 'address': '95 Naranpura Post Office', 'status': 'pending'},
    {'name': 'Aditya Somani', 'roll_no': '113', 'class': 'X-B', 'father_name': 'Manoj Somani', 'blood_group': 'B+', 'phone': '9825101013', 'dob': '2011-08-14', 'bus_route': 'Route 04', 'address': '14 Ambawadi Circle', 'status': 'download'},
    {'name': 'Riya Soni', 'roll_no': '114', 'class': 'X-B', 'father_name': 'Kamlesh Soni', 'blood_group': 'O+', 'phone': '9825101014', 'dob': '2011-04-02', 'bus_route': 'Route 10', 'address': '51 Maninagar East', 'status': 'download'},
    {'name': 'Yashwardhan Rana', 'roll_no': '115', 'class': 'X-B', 'father_name': 'Digvijay Rana', 'blood_group': 'A+', 'phone': '9825101015', 'dob': '2011-07-29', 'bus_route': 'Route 04', 'address': '72 Bopal Sun City', 'status': 'download'},
]

IDCard.objects.filter(table=table1).delete()

created_cards = []
for item in students_data:
    st = item.pop('status')
    card = IDCard.objects.create(
        table=table1,
        field_data=item,
        status=st,
        original_photo_name=f"{item['roll_no']}_{item['name'].replace(' ', '_')}.jpg",
    )
    created_cards.append((card, st))

print(f"Created {len(created_cards)} student ID cards in table '{table1.name}'.")

# Create a Reprint Request on one of the downloaded cards
downloaded_card = [c for c, st in created_cards if st == 'download'][0]
reprint_req, _ = ReprintRequest.objects.get_or_create(
    card=downloaded_card,
    table=table1,
    defaults={
        'status': 'confirmed',
        'reason': 'Lost smart card during inter-school sports tournament. Parent requested urgent duplicate reprint.',
        'reprint_number': 1,
        'changes': {'father_name': 'Shri Manoj Somani (Corrected)'},
        'confirmed_by': shree_admin,
        'confirmed_at': timezone.now(),
    }
)
# Update card status to reprint to trigger in-place badge
downloaded_card.status = 'reprint'
downloaded_card.save(update_fields=['status'])
print(f"Created reprint record for card #{downloaded_card.id} ({downloaded_card.field_data.get('name')}).")

# Faculty Table in DPS
table2, _ = IDCardTable.objects.get_or_create(
    organisation=dps_org,
    name='Faculty & Administrative Staff 2026',
    defaults={
        'description': 'Senior teaching staff and department heads official ID badge records.',
        'table_type': 'employee',
        'fields': [
            {'name': 'Full Name', 'key': 'name', 'type': 'text', 'required': True},
            {'name': 'Emp ID', 'key': 'emp_id', 'type': 'text', 'required': True},
            {'name': 'Designation', 'key': 'designation', 'type': 'text', 'required': True},
            {'name': 'Department', 'key': 'department', 'type': 'text', 'required': True},
            {'name': 'Blood Group', 'key': 'blood_group', 'type': 'text', 'required': True},
            {'name': 'Emergency Contact', 'key': 'phone', 'type': 'phone', 'required': True},
        ],
        'is_active': True,
    }
)

faculty_data = [
    {'name': 'Dr. Sunita Sharma', 'emp_id': 'DPS-T01', 'designation': 'Principal & Director', 'department': 'Administration', 'blood_group': 'O+', 'phone': '9825000001'},
    {'name': 'Prof. Rajesh Kulkarni', 'emp_id': 'DPS-T02', 'designation': 'HOD Mathematics', 'department': 'Science & Maths', 'blood_group': 'B+', 'phone': '9825000002'},
    {'name': 'Ms. Priya Nambiar', 'emp_id': 'DPS-T03', 'designation': 'Senior Lecturer Physics', 'department': 'Physics Wing', 'blood_group': 'A+', 'phone': '9825000003'},
    {'name': 'Mr. Amitav Sengupta', 'emp_id': 'DPS-T04', 'designation': 'HOD Computer Science', 'department': 'IT & AI Lab', 'blood_group': 'AB+', 'phone': '9825000004'},
]
IDCard.objects.filter(table=table2).delete()
for f in faculty_data:
    IDCard.objects.create(
        table=table2,
        field_data=f,
        status='confirm',
        original_photo_name=f"{f['emp_id']}.jpg",
    )
print(f"Created faculty cards in '{table2.name}'.")

# Tables and Cards for St. Xavier's
table_xav, _ = IDCardTable.objects.get_or_create(
    organisation=stxav_org,
    name='Primary Wing (Grades 1 to 5)',
    defaults={
        'description': 'Elementary division student card records with parent emergency numbers.',
        'table_type': 'student',
        'fields': dps_fields,
        'is_active': True,
    }
)
xav_students = [
    {'name': 'Aarush Varma', 'roll_no': '101', 'class': '3-A', 'father_name': 'Kunal Varma', 'blood_group': 'O+', 'phone': '9879001001', 'dob': '2018-05-10', 'bus_route': 'Route 01', 'address': 'Sector 12, Gandhinagar'},
    {'name': 'Kiara Singhania', 'roll_no': '102', 'class': '3-A', 'father_name': 'Aditya Singhania', 'blood_group': 'B+', 'phone': '9879001002', 'dob': '2018-09-14', 'bus_route': 'Route 02', 'address': 'Sector 21, Gandhinagar'},
    {'name': 'Shaurya Chauhan', 'roll_no': '103', 'class': '3-B', 'father_name': 'Vikramaditya Chauhan', 'blood_group': 'A+', 'phone': '9879001003', 'dob': '2018-02-28', 'bus_route': 'Self Transport', 'address': 'Infocity Enclave'},
]
IDCard.objects.filter(table=table_xav).delete()
for s in xav_students:
    IDCard.objects.create(
        table=table_xav,
        field_data=s,
        status='confirm',
        original_photo_name=f"{s['roll_no']}_{s['name'].replace(' ', '_')}.jpg",
    )
print(f"Created student cards in '{table_xav.name}'.")

print("\n==== SEEDING COMPLETE ====")
print("Super Admin credentials for Shree ID Cards:")
print("  Username: shree_admin")
print("  Password: Password@123")
print("  Role: super_admin")
print("  Subscription: Shree ID Cards & Printing Press (PRO TIER)")
print("  Organisations: 3 (Delhi Public School, St. Xavier's High School, Apex International)")
