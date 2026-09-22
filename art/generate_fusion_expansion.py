"""Seven original plush fusion toys, authored entirely in Blender.
Run: blender --background --python art/generate_fusion_expansion.py
Preserves the initial four fusion assets. Exports seven new GLBs and portraits.
"""
from pathlib import Path
shared=Path(__file__).with_name('generate_fusions.py').read_text()
exec(compile(shared.split('\nassets={}')[0],str(Path(__file__).with_name('generate_fusions.py')),'exec'))
for name,color in {
    'fusion-grey':(.39,.405,.39),'fusion-cosmic':(.37,.17,.62),
    'fusion-black':(.007,.006,.014),'fusion-berry':(.80,.075,.10),
    'fusion-seed':(.97,.81,.40),'fusion-berry-leaf':(.27,.52,.17),
    'fusion-cyan':(.10,.68,.77),'fusion-magenta':(.78,.13,.47),
}.items():mat(name,color,rough=.86)

def mushroom_staff(x,color='purple',stem='wood',glowing=False):
    rod('Mushroom staff',(x,-.13,.22),(x,-.13,1.03),.035,stem)
    uv('Soft mushroom crown',(x,-.13,1.045),(.21,.18,.11),color,24,14)
    uv('Cream mushroom underside',(x,-.13,1.015),(.185,.159,.026),'fusion-ivory',20,10)
    for dx,dy in [(-.085,-.04),(.06,-.08),(.07,.065),(-.04,.07)]:
        uv('Mushroom embroidered spot',(x+dx,-.13+dy,1.132),(.028,.026,.014),'fusion-mint' if glowing else 'white',12,8)
    if glowing:
        halo=torus('Soul mushroom halo',(x,-.13,1.045),.245,.012,'fusion-mint');halo.rotation_euler.x=.22

def bomb(x=.39,z=.60,berry=False):
    uv('Round padded explosive',(x,-.23,z),(.19,.18,.19),'fusion-berry' if berry else 'fusion-charcoal',20,14)
    rod('Curled golden fuse',(x,-.23,z+.17),(x+.05,-.23,z+.28),.016,'gold')
    uv('Quiet fuse glow',(x+.05,-.23,z+.29),(.04,.04,.04),'fusion-mint' if berry else 'orange',12,8)
    if berry:
        for dx,dz in [(-.07,-.04),(.065,-.01),(0,.065)]:uv('Dark bomb seeds',(x+dx,-.397,z+dz),(.013,.01,.025),'fusion-black',8,6)
        for side in [-1,1]:leaf('Berry bomb crown',(x+side*.05,-.24,z+.16),'fusion-berry-leaf',side*.55,.75)

def berry(x,y,z,size=.18):
    uv('Plump berry',(x,y,z),(.70*size,.66*size,.86*size),'fusion-berry',20,14)
    for row,dz in enumerate([-.38,.02,.40]):
        for i in range(8):
            a=(i+row*.5)*math.tau/8;r=.65*size*math.sqrt(1-dz*dz)
            o=uv('Tiny berry seed',(x+r*math.cos(a),y+r*math.sin(a),z+dz*size),(.022*size,.014*size,.049*size),'fusion-seed',8,6);o.rotation_euler.z=a-math.pi/2
    for i in range(4):
        a=i*math.tau/4;o=uv('Berry leaf crown',(x+.025*math.cos(a),y+.025*math.sin(a),z+.80*size),(.42*size,.15*size,.085*size),'fusion-berry-leaf',12,8);o.rotation_euler.z=a

def mortar(x=.42,material='fusion-cosmic'):
    bottom=Vector((x,-.13,.30));top=Vector((x,-.39,.80));axis=(top-bottom).normalized();rotation=axis.to_track_quat('Z','Y')
    verts=[];faces=[];n=24;length=(top-bottom).length
    for height,radius in [(0,.17),(length,.17),(length,.123),(.11,.123)]:
        for i in range(n):
            a=i*math.tau/n;verts.append(bottom+rotation@Vector((radius*math.cos(a),radius*math.sin(a),height)))
    for row in range(3):
        for i in range(n):j=(i+1)%n;faces.append((row*n+i,row*n+j,(row+1)*n+j,(row+1)*n+i))
    faces.append(tuple(reversed(range(n))));faces.append(tuple(range(n*3,n*4)))
    mesh=bpy.data.meshes.new('Hollow plush mortar');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Hollow plush mortar',mesh);bpy.context.collection.objects.link(o);add(o,o.name,(0,0,0),(1,1,1),material)
    o.data.materials.append(M['fusion-black'])
    for poly in mesh.polygons:
        poly.use_smooth=True
        if poly.index>=n*2:poly.material_index=1
    rim=torus('Rounded mortar mouth',top,.172,.025,'gold');rim.rotation_euler=rotation.to_euler()
    uv('Padded mortar foot',(x,-.1,.18),(.24,.22,.075),material,16,10)

def orbit_body(accent):
    gnome('fusion','red')
    for obj in parts:
        if obj.name.startswith(('Drooping wool hat','Wool knitted rib')):recolor(obj,'fusion-grey')
    torus('Red Orbit hat cuff',(0,0,.832),.362,.019,'red')
    torus('Partner color stitched cuff',(0,0,.865),.355,.009,accent)
    for side in [-1,1]:uv('Soft crimson shoulder',(side*.33,.005,.665),(.13,.13,.095),'red',16,10)

def orbit_staff(x=-.43,accent='fusion-cosmic'):
    rod('Orbit staff',(x,-.13,.25),(x,-.13,1.03),.030,accent)
    uv('Small dark star',(x,-.13,1.13),(.11,.11,.11),'fusion-black',20,12)
    ring=torus('Violet orbit',(x,-.13,1.13),.175,.017,'fusion-cosmic');ring.rotation_euler=(.9,.2,.3)
    ring=torus('Partner orbit',(x,-.13,1.13),.144,.013,accent);ring.rotation_euler=(.1,.8,-.4)
    uv('Tiny orbiting star',(x+.175,-.15,1.19),(.029,)*3,'gold',12,8)

def gem(loc,size,material):
    x,y,z=loc
    cone('Soft jewel waist',(x,y,z+size*.45),size*.28,size*.26,size*.60,material,6)
    cone('Jewel pointed crown',(x,y,z+size*.92),size*.26,0,size*.34,material,6)
    uv('Jewel padded mount',(x,y,z+.05),(.10,.085,.044),'gold',12,8)

assets={}
reset();body('boom-spore',['orange','purple']);mushroom_staff(-.42);bomb(.41)
for x,z in [(-.13,1.05),(.08,1.16),(.16,1.03)]:uv('Caplike hat spots',(x,-.29 if z<1.1 else -.25,z),(.032,.012,.021),'fusion-ivory',12,8)
assets['boom-spore']=grounded_export('gnome-fusion-boom-spore')

reset();body('sniper-stun',['blue','pink'])
# A long precision toy gun and its bright pink slowing pulse sidearm.
cube('Long starshot rifle',(.38,-.34,.65),(.15,.69,.14),'blue',.025)
rod('Long golden barrel',(.38,-.43,.65),(.38,-.76,.65),.041,'gold')
cube('Wooden rifle stock',(.38,-.16,.52),(.079,.10,.22),'wood',.02)
rod('Pink padded scope',(.38,-.23,.79),(.38,-.44,.79),.045,'pink')
ring=torus('Pink precision muzzle',(.38,-.76,.65),.068,.012,'pink');ring.rotation_euler.x=math.pi/2
shooter(-.38,'pink');ring=torus('Pulse sidearm muzzle',(-.38,-.545,.62),.075,.017,'pink');ring.rotation_euler.x=math.pi/2
for x in [-.13,.12]:uv('Cream star hat stitch',(x,-.277,1.055),(.024,.012,.031),'fusion-ivory',12,8)
assets['sniper-stun']=grounded_export('gnome-fusion-sniper-stun')

reset();orbit_body('fusion-berry-leaf');orbit_staff(-.43,'fusion-berry-leaf');mortar(.45)
for obj in list(parts):
    if obj.name.startswith('Small dark star'):
        parts.remove(obj);bpy.data.objects.remove(obj,do_unlink=True)
berry(-.43,-.13,1.14,.19)
for x,y,z in [(-.14,-.265,1.04),(.11,-.24,1.17),(.11,-.17,1.30)]:
    uv('Cream berry hat stitch',(x,y,z),(.014,.012,.027),'fusion-seed',10,7)
leaf('Orbit berry leaf',(.26,-.04,1.43),'fusion-berry-leaf',.2,1)
assets['gravity-strawberry']=grounded_export('gnome-fusion-gravity-strawberry')

reset();body('crystal-sprout',['fusion-teal','green']);sling(-.4)
rod('Emerald keeper staff',(.43,-.15,.22),(.43,-.15,1.0),.033,'gold')
gem((.43,-.15,.93),.42,'fusion-cyan');gem((.30,-.15,.96),.25,'fusion-magenta');gem((.56,-.15,.96),.23,'fusion-leaf')
for x,z,color in [(-.15,1.03,'fusion-magenta'),(.12,1.12,'fusion-cyan')]:gem((x,-.26,z),.13,color)
for x in [-.36,.36]:leaf('Crystal shoulder leaf',(x,-.11,.73),'fusion-leaf',x,.9)
assets['crystal-sprout']=grounded_export('gnome-fusion-crystal-sprout')

reset();body('necro-spore',['fusion-plum','purple']);mushroom_staff(-.43,'fusion-plum','fusion-charcoal',True);soul_staff(.43)
uv('Tiny mint cap on hat',(.18,-.14,1.37),(.105,.09,.045),'fusion-mint',16,10)
for x,y in [(.14,-.18),(.21,-.12)]:uv('Tiny soul cap spots',(x,y,1.406),(.015,.015,.010),'fusion-ivory',10,6)
assets['necro-spore']=grounded_export('gnome-fusion-necro-spore')

reset();body('boom-strawberry',['orange','fusion-berry']);mortar(.44,'orange');bomb(-.41,.59,True)
for x,y,z in [(-.13,-.276,1.04),(.08,-.25,1.16),(.15,-.17,1.30)]:uv('Berry cream hat stitch',(x,y,z),(.015,.012,.029),'fusion-seed',10,7)
leaf('Berry fuse hat leaf',(.27,-.04,1.43),'fusion-berry-leaf',.2,1)
assets['boom-strawberry']=grounded_export('gnome-fusion-boom-strawberry')

reset();orbit_body('pink');orbit_staff(-.44,'pink');shooter(.39,'pink')
ring=torus('Eventide pulse muzzle',(.39,-.55,.62),.08,.018,'pink');ring.rotation_euler.x=math.pi/2
# Two stitched crescent accents give the grey hat its new twilight identity.
for i in range(13):
    a=math.radians(55+i*250/12)
    uv('Tiny pink crescent stitch',(-.10+.053*math.cos(a),-.29,1.035+.053*math.sin(a)),(.010,.009,.010),'pink',8,6)
uv('Twilight hat star',(.12,-.24,1.19),(.024,.014,.029),'fusion-ivory',10,7)
assets['gravity-stun']=grounded_export('gnome-fusion-gravity-stun')

scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
scene.render.resolution_x=320;scene.render.resolution_y=320;scene.render.resolution_percentage=100
scene.world.color=(.35,.35,.35);scene.view_settings.view_transform='AgX'
for name,loc,power,size in [('Warm softbox',(-3,-4,5),380,4),('Cool fill',(3,-1,3),220,3),('Rim light',(1,3,4),450,3)]:
    bpy.ops.object.light_add(type='AREA',location=loc);obj=bpy.context.object;obj.name=name;obj.data.energy=power;obj.data.shape='DISK';obj.data.size=size;obj.rotation_euler=(Vector((0,0,.7))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(2.3,-5,2.8));cam=bpy.context.object;cam.rotation_euler=(Vector((0,-.03,.76))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.10;scene.camera=cam
for key,obj in assets.items():
    obj.hide_render=False;obj.hide_set(False);scene.render.filepath=os.path.join(OUT,'fusion-'+key+'.png');bpy.ops.render.render(write_still=True);obj.hide_render=True;obj.hide_set(True)
for x,obj in zip([-4.2,-2.8,-1.4,0,1.4,2.8,4.2],assets.values()):obj.location.x=x;obj.hide_render=False;obj.hide_set(False)
cam.location=(.7,-10,4);cam.rotation_euler=(Vector((0,0,.76))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=10.5
scene.render.resolution_x=2100;scene.render.resolution_y=520
scene.render.filepath=os.path.join(ROOT,'art','fusion-expansion-preview.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'art','fusion-expansion.blend'),compress=True)
print('GNOMEWARD_FUSION_EXPANSION_COMPLETE')
