package com.agaeye;

import com.agaeye.common.*;
import com.agaeye.notification.*;
import com.agaeye.security.*;
import com.fasterxml.jackson.databind.*;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpMethod;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.nio.charset.StandardCharsets;
import com.agaeye.device.PairingService;
import static com.agaeye.common.Db.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

@SpringBootTest(properties={"app.outbox-enabled=false","app.jwt-secret=integration-test-jwt-key-at-least-32-characters","app.worker-key=integration-worker-secret","app.mail-mode=local","app.media-gateway-url=https://media.example.test"})
@AutoConfigureMockMvc(print=MockMvcPrint.NONE)
class ApiIntegrationTest {
    private static final EmbeddedPostgres PG;
    static {try{PG=LocalPostgres.builder().start();}catch(Exception ex){throw new ExceptionInInitializerError(ex);}}
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry){registry.add("spring.datasource.url",()->PG.getJdbcUrl("postgres","postgres"));registry.add("spring.datasource.username",()->"postgres");registry.add("spring.datasource.password",()->"");}
    @Autowired MockMvc mvc;@Autowired ObjectMapper json;@Autowired Db db;@Autowired OutboxWorker outbox;@Autowired Policy policy;@Autowired NotificationService notifications;@Autowired JwtDecoder decoder;
    record User(String token,String refresh,UUID workspace,UUID member,UUID user,String email){}
    private int emails;
    @BeforeEach void reset(){db.update("TRUNCATE users,rate_limits RESTART IDENTITY CASCADE",Map.of());emails=0;}
    private JsonNode response(MockHttpServletRequestBuilder request,int status)throws Exception{
        var result=mvc.perform(request).andReturn();String content=result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        JsonNode body=content.isBlank()?json.createObjectNode():json.readTree(content);
        // Do not print full responses: auth responses contain secrets.
        assertThat(result.getResponse().getStatus()).withFailMessage("Expected %s, got %s (%s)",status,result.getResponse().getStatus(),body.path("error").path("code").asText()).isEqualTo(status);return body;
    }
    private JsonNode call(String method,String path,User user,Object body,String key,int status)throws Exception{
        var req=request(HttpMethod.valueOf(method),"/api/v1"+path).contentType("application/json");
        if(user!=null)req.header("Authorization","Bearer "+user.token()).header("X-Workspace-Id",user.workspace());if(key!=null)req.header("Idempotency-Key",key);if(body!=null)req.content(json.writeValueAsBytes(body));return response(req,status);
    }
    private JsonNode call(String method,String path,User user,Object body,int status)throws Exception{return call(method,path,user,body,null,status);}
    private JsonNode worker(String path,Object body,int status)throws Exception{return response(post("/api/v1/internal"+path).header("X-Worker-Key","integration-worker-secret").contentType("application/json").content(json.writeValueAsBytes(body)),status);}
    private UUID uuid(JsonNode node,String field){return UUID.fromString(node.path(field).asText());}
    private User user()throws Exception{
        String email="test"+(++emails)+"@example.test";var signed=call("POST","/auth/signup",null,p("email",email,"password","correct-password-123"),201);
        call("POST","/auth/verify-email",null,p("token",call("POST","/auth/request-verification",null,p("email",signed.path("email").asText()),200).path("verificationToken").asText()),200);
        return new User(signed.path("accessToken").asText(),signed.path("refreshToken").asText(),uuid(signed,"workspaceId"),uuid(signed,"membershipId"),uuid(signed,"userId"),email);
    }
    private User usernameUser()throws Exception{
        var signed=call("POST","/auth/signup",null,p("username","parent"+(++emails),"password","correct-password-123"),201);
        assertThat(signed.path("email").isNull()).isTrue();assertThat(signed.path("emailVerified").asBoolean()).isFalse();assertThat(signed.has("verificationToken")).isFalse();
        assertThat(db.list("SELECT id FROM email_verifications WHERE user_id=:id",p("id",uuid(signed,"userId")))).isEmpty();
        return new User(signed.path("accessToken").asText(),signed.path("refreshToken").asText(),uuid(signed,"workspaceId"),uuid(signed,"membershipId"),uuid(signed,"userId"),null);
    }
    private User workspace(User user,UUID workspace,UUID member){return new User(user.token(),user.refresh(),workspace,member,user.user(),user.email());}
    private JsonNode child(User user)throws Exception{return call("POST","/children",user,p("displayName","지안","birthDate","2026-01-15"),201);}
    private UUID camera(User user,UUID child)throws Exception{return uuid(worker("/devices",p("workspaceId",user.workspace(),"childId",child,"type","camera"),200),"id");}
    private JsonNode detection(User user,UUID child,UUID camera,String type,String severity,Instant at)throws Exception{
        return worker("/detections",p("workspaceId",user.workspace(),"childId",child,"sourceId",camera,"sourceEventId",UUID.randomUUID(),"type",type,"severity",severity,"startedAt",at,"endedAt",at.plusSeconds(1),"verifiable",true,"confidence",0.91,"modelVersion","fixture-1"),200);
    }
    private JsonNode invite(User owner,User target,JsonNode child,List<String> caps)throws Exception{return call("POST","/workspaces/"+owner.workspace()+"/invitations",owner,p("email",target.email(),"role","sitter","children",List.of(p("workspaceChildId",uuid(child,"workspaceChildId"),"capabilities",caps)),"validUntil",Instant.now().plusSeconds(3600)),UUID.randomUUID().toString(),200);}
    private User accept(User owner,User target,JsonNode invite)throws Exception{
        var token=call("POST","/invitations/"+invite.path("id").asText()+"/local-token",owner,Map.of(),200);
        var accepted=call("POST","/invitations/accept",target,p("token",token.path("invitationToken").asText()),"accept-1",200);return workspace(target,owner.workspace(),uuid(accepted,"membershipId"));
    }
    private void heartbeat(UUID camera,String status)throws Exception{worker("/devices/"+camera+"/heartbeat",p("observedAt",Instant.now(),"analysisObservedAt",Instant.now(),"confidence",0.9,"status",status,"safety",p("posture","stable","face","stable","edge","stable","objects","stable")),200);}

    @Test void signupCreatesPersonalWorkspaceAndHashesTokens()throws Exception{
        User user=user();var spaces=call("GET","/me/workspaces",user,null,200);assertThat(spaces.path("items").get(0).path("type").asText()).isEqualTo("PERSONAL");
        var row=db.required("SELECT token_hash FROM user_sessions WHERE user_id=:id",p("id",user.user()),"missing");assertThat(row.get("token_hash")).isEqualTo(Secrets.hash(user.refresh())).isNotEqualTo(user.refresh());
        assertThat(call("GET","/children",user,null,200).path("items")).isEmpty();
    }
    @Test void signupWithoutEmailSupportsLoginAndRefreshAndDoesNotSendVerification()throws Exception{
        var owner=usernameUser();var other=usernameUser();
        assertThat(other.user()).isNotEqualTo(owner.user());
        var login=call("POST","/auth/login",null,p("username","PARENT1","password","correct-password-123"),200);
        assertThat(uuid(login,"userId")).isEqualTo(owner.user());assertThat(login.path("email").isNull()).isTrue();
        var refreshed=call("POST","/auth/refresh",null,p("refreshToken",login.path("refreshToken").asText()),200);
        assertThat(refreshed.path("username").asText()).isEqualTo("parent1");assertThat(refreshed.path("emailVerified").asBoolean()).isFalse();
        call("POST","/auth/signup",null,p("password","correct-password-123"),422);
        assertThat(db.list("SELECT id FROM email_verifications",Map.of())).isEmpty();
    }
    @Test void usernameLoginPreservesAccountChildrenAndOptionalEmail()throws Exception{
        var signed=call("POST","/auth/signup",null,p("username"," Agaeye.Parent ","email","parent@example.test","password","correct-password-123"),201);
        assertThat(signed.path("username").asText()).isEqualTo("agaeye.parent");assertThat(signed.path("email").asText()).isEqualTo("parent@example.test");
        var owner=new User(signed.path("accessToken").asText(),signed.path("refreshToken").asText(),uuid(signed,"workspaceId"),uuid(signed,"membershipId"),uuid(signed,"userId"),"parent@example.test");
        UUID child=uuid(child(owner),"id");
        var login=call("POST","/auth/login",null,p("username"," AGAEYE.PARENT ","password","correct-password-123"),200);
        assertThat(login.path("userId")).isEqualTo(signed.path("userId"));assertThat(login.path("username").asText()).isEqualTo("agaeye.parent");
        var same=new User(login.path("accessToken").asText(),login.path("refreshToken").asText(),owner.workspace(),owner.member(),owner.user(),owner.email());
        assertThat(uuid(call("GET","/children",same,null,200).path("items").get(0),"id")).isEqualTo(child);
        call("POST","/auth/verify-email",null,p("token",call("POST","/auth/request-verification",null,p("email",signed.path("email").asText()),200).path("verificationToken").asText()),200);
        var refreshed=call("POST","/auth/refresh",null,p("refreshToken",login.path("refreshToken").asText()),200);
        assertThat(refreshed.path("username").asText()).isEqualTo("agaeye.parent");assertThat(refreshed.path("emailVerified").asBoolean()).isTrue();
        assertThat(call("POST","/auth/login",null,p("email",owner.email(),"password","correct-password-123"),200).path("userId")).isEqualTo(signed.path("userId"));
        assertThat(call("POST","/auth/login",null,p("username",owner.email(),"password","correct-password-123"),200).path("userId")).isEqualTo(signed.path("userId"));
    }
    @Test void usernamesAreUniqueAndLoginFailuresDoNotRevealAccountExistence()throws Exception{
        call("POST","/auth/signup",null,p("username","parent","email","one@example.test","password","correct-password-123"),201);
        assertThat(call("POST","/auth/signup",null,p("username","PARENT","email","two@example.test","password","correct-password-123"),409).path("error").path("code").asText()).isEqualTo("USERNAME_UNAVAILABLE");
        for(String name:List.of("", "bad name", "parent@example.test", "_parent", "x".repeat(33)))call("POST","/auth/signup",null,p("username",name,"email","invalid@example.test","password","correct-password-123"),422);
        for(String name:List.of("parent","missing"))assertThat(call("POST","/auth/login",null,p("username",name,"password","wrong-password"),401).path("error").path("code").asText()).isEqualTo("INVALID_CREDENTIALS");
        call("POST","/auth/login",null,p("password","correct-password-123"),422);
        call("POST","/auth/login",null,p("username","parent","email","one@example.test","password","correct-password-123"),422);
        db.update("UPDATE users SET status='disabled' WHERE username='parent'",Map.of());
        call("POST","/auth/login",null,p("username","parent","password","correct-password-123"),401);
    }
    @Test void legacySignupAssignsDistinctIdsForTheSameEmailPrefix()throws Exception{
        var first=call("POST","/auth/signup",null,p("email","family@one.test","password","correct-password-123"),201);
        var second=call("POST","/auth/signup",null,p("email","family@two.test","password","correct-password-123"),201);
        assertThat(first.path("username").asText()).isEqualTo("family");assertThat(second.path("username").asText()).isEqualTo("family_2");
        assertThat(call("POST","/auth/login",null,p("username","family_2","password","correct-password-123"),200).path("userId")).isEqualTo(second.path("userId"));
        assertThat(call("POST","/auth/login",null,p("email","family@one.test","password","correct-password-123"),200).path("userId")).isEqualTo(first.path("userId"));
    }
    @Test void concurrentSignupCannotClaimTheSameUsernameTwice()throws Exception{
        try(var pool=Executors.newVirtualThreadPerTaskExecutor()) {
            var requests=new ArrayList<Future<Integer>>();
            for(String email:List.of("race-a@example.test","race-b@example.test"))requests.add(pool.submit(()->mvc.perform(post("/api/v1/auth/signup").contentType("application/json").content(json.writeValueAsBytes(p("username","racing-parent","email",email,"password","correct-password-123")))).andReturn().getResponse().getStatus()));
            assertThat(List.of(requests.get(0).get(10,TimeUnit.SECONDS),requests.get(1).get(10,TimeUnit.SECONDS))).containsExactlyInAnyOrder(201,409);
        }
        assertThat(db.list("SELECT id FROM users WHERE username='racing-parent'",Map.of())).hasSize(1);
    }
    @Test void unauthenticatedAndInternalRequestsFailWithRequestId()throws Exception{
        var failure=call("GET","/children",null,null,401);assertThat(failure.path("error").path("requestId").asText()).matches("[0-9a-f-]{36}");
        call("POST","/internal/devices",null,Map.of(),401);
        assertThat(mvc.perform(get("/actuator/health")).andReturn().getResponse().getStatus()).isEqualTo(200);
    }
    @Test void otherWorkspaceAndMembershipAloneNeverGrantChildAccess()throws Exception{
        var owner=user();var outsider=user();var child=child(owner);UUID id=uuid(child,"id");
        call("GET","/children/"+id,outsider,null,404);call("GET","/children/"+id,workspace(outsider,owner.workspace(),outsider.member()),null,404);
        UUID member=UUID.randomUUID();db.update("INSERT INTO memberships(id,workspace_id,user_id,role) VALUES(:id,:ws,:u,'staff')",p("id",member,"ws",owner.workspace(),"u",outsider.user()));
        var staff=workspace(outsider,owner.workspace(),member);call("GET","/children/"+id,staff,null,404);assertThat(call("GET","/dashboard",staff,null,200).path("items")).isEmpty();
    }
    @Test void sitterCanOnlyReadGrantedSafetyChildAndCannotWatchVideo()throws Exception{
        var owner=user();var sitter=user();var a=child(owner);var b=child(owner);var invited=invite(owner,sitter,a,List.of("detection:read"));sitter=accept(owner,sitter,invited);
        call("GET","/children/"+a.path("id").asText()+"/events?type=edge_proximity",sitter,null,200);
        call("GET","/children/"+a.path("id").asText()+"/monitoring",sitter,null,403);
        call("GET","/children/"+b.path("id").asText()+"/events?type=edge_proximity",sitter,null,404);
        call("GET","/children/"+a.path("id").asText()+"/events",sitter,null,200);
        call("GET","/children/"+a.path("id").asText()+"/summary",sitter,null,403);
    }
    @Test void invitationsRequireVerifiedMatchingEmailAndRejectExpiration()throws Exception{
        var owner=user();var target=user();var wrong=user();var invited=invite(owner,target,child(owner),List.of("detection:read"));
        var token=call("POST","/invitations/"+invited.path("id").asText()+"/local-token",owner,Map.of(),200).path("invitationToken").asText();
        call("POST","/invitations/accept",wrong,p("token",token),"wrong-email",403);
        db.update("UPDATE users SET email_verified=false WHERE id=:id",p("id",target.user()));call("POST","/invitations/accept",target,p("token",token),"unverified",403);
        db.update("UPDATE users SET email_verified=true WHERE id=:id",p("id",target.user()));db.update("UPDATE invitations SET expires_at=now()-interval '1 second' WHERE id=:id",p("id",uuid(invited,"id")));
        assertThat(call("POST","/invitations/accept",target,p("token",token),"expired",409).path("error").path("code").asText()).isEqualTo("INVITE_EXPIRED");
    }
    @Test void invitationAcceptanceReplaysOnce()throws Exception{
        var owner=user();var target=user();var invited=invite(owner,target,child(owner),List.of("detection:read"));var token=call("POST","/invitations/"+invited.path("id").asText()+"/local-token",owner,Map.of(),200).path("invitationToken").asText();
        var first=call("POST","/invitations/accept",target,p("token",token),"accept-once",200);var second=call("POST","/invitations/accept",target,p("token",token),"accept-once",200);assertThat(second).isEqualTo(first);
        assertThat(db.list("SELECT id FROM child_access_grants WHERE invitation_id=:id",p("id",uuid(invited,"id")))).hasSize(1);
    }
    @Test void revokingInvitationInvalidatesApiSseScopeAndRetiresStreaming()throws Exception{
        var owner=user();var target=user();var child=child(owner);UUID id=uuid(child,"id"),camera=camera(owner,id);heartbeat(camera,"live");
        var invited=invite(owner,target,child,List.of("child:read","monitor:live","detection:read","notification:receive"));target=accept(owner,target,invited);
        call("POST","/children/"+id+"/stream-token",target,Map.of(),410);worker("/stream-tokens/introspect",p("token","retired"),410);
        var jwt=decoder.decode(target.token());assertThat(notifications.children(policy.actor(jwt,target.workspace()))).contains(id);
        var connection=mvc.perform(get("/api/v1/realtime").header("Authorization","Bearer "+target.token()).header("X-Workspace-Id",target.workspace())).andReturn();
        assertThat(connection.getRequest().isAsyncStarted()).isTrue();
        call("DELETE","/invitations/"+invited.path("id").asText(),owner,null,200);
        assertThat(connection.getAsyncResult(5000)).isNull();
        call("GET","/children/"+id,target,null,404);worker("/stream-tokens/introspect",p("token","retired"),410);
        assertThat(notifications.children(policy.actor(jwt,target.workspace()))).isEmpty();
    }
    @Test void expiredGrantStopsExistingAccess()throws Exception{
        var owner=user();var target=user();var child=child(owner);var invited=invite(owner,target,child,List.of("detection:read"));target=accept(owner,target,invited);
        db.update("UPDATE child_access_grants SET valid_from=now()-interval '2 hours',valid_until=now()-interval '1 hour' WHERE invitation_id=:id",p("id",uuid(invited,"id")));
        call("GET","/children/"+child.path("id").asText()+"/events?type=edge_proximity",target,null,404);
    }
    @Test void explicitShareNeedsTargetGrantAndRevokesAcrossOpenSession()throws Exception{
        var owner=user();var instituteUser=user();var institute=call("POST","/workspaces",instituteUser,p("name","아가아이 어린이집"),200);var institution=workspace(instituteUser,uuid(institute,"id"),uuid(institute,"membershipId"));
        var child=child(owner);UUID id=uuid(child,"id");var event=detection(owner,id,camera(owner,id),"edge_proximity","caution",Instant.now().minusSeconds(10));
        var caps=List.of("child:read","detection:read");var share=call("POST","/data-share-grants",owner,p("childId",id,"toWorkspaceId",institution.workspace(),"scopes",caps,"consentRef","signed-consent-fixture","expiresAt",Instant.now().plusSeconds(3600)),"share-1",200);
        call("GET","/children/"+id,institution,null,404);
        call("POST","/workspace-children/"+share.path("workspaceChildId").asText()+"/grants",institution,p("membershipId",institution.member(),"capabilities",caps),200);
        call("GET","/children/"+id,institution,null,200);
        assertThat(call("GET","/children/"+id+"/events?type=edge_proximity",institution,null,200).path("items")).isEmpty();
        assertThat(call("GET","/data-share-grants/"+share.path("id").asText()+"/events?type=edge_proximity",institution,null,200).path("items").size()).isEqualTo(1);
        call("GET","/events/"+event.path("id").asText(),institution,null,404);
        call("DELETE","/data-share-grants/"+share.path("id").asText(),owner,null,200);
        call("GET","/children/"+id,institution,null,404);call("GET","/data-share-grants/"+share.path("id").asText()+"/events?type=edge_proximity",institution,null,404);
        call("GET","/children/"+id,owner,null,200);
    }
    @Test void offlineObstructedAndStaleAnalysisNeverBecomeStable()throws Exception{
        var owner=user();UUID child=uuid(child(owner),"id");var state=call("GET","/children/"+child+"/monitoring",owner,null,200);
        assertThat(state.path("streamStatus").asText()).isEqualTo("offline");assertThat(state.path("safety").path("face").asText()).isEqualTo("unknown");assertThat(state.path("sensors").get(0).path("value").isNull()).isTrue();
        UUID camera=camera(owner,child);heartbeat(camera,"unverifiable");assertThat(call("GET","/children/"+child+"/monitoring",owner,null,200).path("streamStatus").asText()).isEqualTo("unverifiable");
        worker("/devices/"+camera+"/heartbeat",p("observedAt",Instant.now(),"status","live","confidence",0.9,"analysisObservedAt",Instant.now().minusSeconds(120)),200);
        assertThat(call("GET","/dashboard",owner,null,200).path("items").get(0).path("severity").asText()).isEqualTo("unknown");
        var low=worker("/detections",p("workspaceId",owner.workspace(),"childId",child,"sourceId",camera,"sourceEventId","low-confidence","type","face_covered","severity","immediate","startedAt",Instant.now(),"confidence",0.1,"verifiable",true),200);
        assertThat(low.path("status").asText()).isEqualTo("unverifiable");assertThat(low.path("severity").asText()).isEqualTo("unknown");
    }
    @Test void sensorValuesRequireActualRecentMeasurements()throws Exception{
        var owner=user();UUID child=uuid(child(owner),"id"),camera=camera(owner,child);worker("/devices/"+camera+"/readings",p("type","temperature","value",23.5,"observedAt",Instant.now()),200);
        var sensors=call("GET","/children/"+child+"/monitoring",owner,null,200).path("sensors");assertThat(sensors.get(0).path("connected").asBoolean()).isTrue();assertThat(sensors.get(0).path("value").asDouble()).isEqualTo(23.5);assertThat(sensors.get(1).path("value").isNull()).isTrue();
    }
    @Test void readingAndAcknowledgingNeverResolveAndNeedsHelpRemainsChecking()throws Exception{
        var owner=user();UUID child=uuid(child(owner),"id"),event=uuid(detection(owner,child,camera(owner,child),"face_covered","immediate",Instant.now().minusSeconds(5)),"id");
        assertThat(outbox.dispatchOne()).isTrue();var inbox=call("GET","/notifications",owner,null,200);UUID note=uuid(inbox.path("items").get(0),"id");
        call("PATCH","/notifications/"+note+"/read",owner,Map.of(),200);assertThat(call("GET","/events/"+event,owner,null,200).path("status").asText()).isEqualTo("new");
        call("POST","/events/"+event+"/acknowledgements",owner,Map.of(),200);assertThat(call("GET","/events/"+event,owner,null,200).path("status").asText()).isEqualTo("acknowledged");
        var help=call("POST","/events/"+event+"/resolution",owner,p("result","needs_help"),"help",200);assertThat(help.path("status").asText()).isEqualTo("checking");assertThat(help.path("resolvedAt").isNull()).isTrue();
        var resolved=call("POST","/events/"+event+"/resolution",owner,p("result","checked_safe","note","현장 확인"),"resolve",200);assertThat(resolved.path("status").asText()).isEqualTo("resolved");
        assertThat(call("POST","/events/"+event+"/resolution",owner,p("result","checked_safe","note","현장 확인"),"resolve",200)).isEqualTo(resolved);
        call("POST","/events/"+event+"/resolution",owner,p("result","false_alarm"),"resolve-new",409);
    }
    @Test void outboxSurvivesOfflineClientAndRechecksRevokedRecipients()throws Exception{
        var owner=user();var sitter=user();var child=child(owner);UUID id=uuid(child,"id");var invited=invite(owner,sitter,child,List.of("detection:read","notification:receive"));sitter=accept(owner,sitter,invited);
        detection(owner,id,camera(owner,id),"face_covered","immediate",Instant.now().minusSeconds(2));call("DELETE","/invitations/"+invited.path("id").asText(),owner,null,200);
        assertThat(outbox.dispatchOne()).isTrue();assertThat(outbox.dispatchOne()).isFalse();
        assertThat(call("GET","/notifications",sitter,null,200).path("items")).isEmpty();assertThat(call("GET","/notifications",owner,null,200).path("items").size()).isEqualTo(1);
        var actor=policy.actor(decoder.decode(owner.token()),owner.workspace());var replay=notifications.replay(actor,0,notifications.children(actor));assertThat(replay).hasSize(1);assertThat(replay.getFirst()).doesNotContainKeys("summary","displayName");
        assertThat(call("GET","/children/"+id+"/events",owner,null,200).path("items").size()).isEqualTo(1);
    }
    @Test void keysetCursorsHaveNoDuplicatesAndAreBoundToChild()throws Exception{
        var owner=user();UUID child=uuid(child(owner),"id"),other=uuid(child(owner),"id"),camera=camera(owner,child);Instant at=Instant.now().minusSeconds(10);
        // Independent bound devices create independent cries, even at the same timestamp.
        for(int i=0;i<3;i++)detection(owner,child,camera(owner,child),"edge_proximity","caution",at);
        var first=call("GET","/children/"+child+"/events?type=edge_proximity&limit=2",owner,null,200);String cursor=first.path("nextCursor").asText();var second=call("GET","/children/"+child+"/events?type=edge_proximity&limit=2&cursor="+cursor,owner,null,200);
        assertThat(first.path("items").size()).isEqualTo(2);assertThat(second.path("items").size()).isEqualTo(1);assertThat(List.of(first.path("items").get(0).path("id").asText(),first.path("items").get(1).path("id").asText())).doesNotContain(second.path("items").get(0).path("id").asText());
        call("GET","/children/"+other+"/events?type=edge_proximity&cursor="+cursor,owner,null,422);call("GET","/children/"+child+"/events?limit=101",owner,null,422);
    }
    @Test void dashboardSortsByRiskAndMissingSummaryDataStaysNull()throws Exception{
        var owner=user();UUID unknown=uuid(child(owner),"id"),caution=uuid(child(owner),"id"),immediate=uuid(child(owner),"id"),stable=uuid(child(owner),"id");
        detection(owner,caution,camera(owner,caution),"edge_proximity","caution",Instant.now().minusSeconds(3));detection(owner,immediate,camera(owner,immediate),"face_covered","immediate",Instant.now().minusSeconds(3));heartbeat(camera(owner,stable),"live");
        var items=call("GET","/dashboard",owner,null,200).path("items");assertThat(items.get(0).path("id").asText()).isEqualTo(immediate.toString());assertThat(items.get(1).path("id").asText()).isEqualTo(caution.toString());assertThat(items.get(2).path("id").asText()).isEqualTo(unknown.toString());assertThat(items.get(3).path("severity").asText()).isEqualTo("stable");
        var summary=call("GET","/children/"+unknown+"/summary",owner,null,200);assertThat(summary.path("hasData").asBoolean()).isFalse();assertThat(summary.path("cryCount").isMissingNode()).isTrue();
    }
    @Test void routinesPersistCompletionAndRejectCrossChildWrite()throws Exception{
        var owner=user();UUID a=uuid(child(owner),"id"),b=uuid(child(owner),"id");var routine=call("POST","/children/"+a+"/routines",owner,p("type","play","title","놀기","scheduledAt",Instant.now()),201);String path="/children/"+a+"/routines/"+routine.path("id").asText();
        var done=call("PATCH",path,owner,p("status","done"),200);assertThat(done.path("completedAt").isNull()).isFalse();
        call("PATCH","/children/"+b+"/routines/"+routine.path("id").asText(),owner,p("status","done"),404);
        assertThat(call("PATCH",path,owner,p("status","todo"),200).path("completedAt").isNull()).isTrue();call("DELETE",path,owner,null,200);assertThat(call("GET","/children/"+a+"/routines",owner,null,200).path("items")).isEmpty();
    }
    @Test void refreshRotationAndReuseRevokeEntireFamily()throws Exception{
        var owner=user();var rotated=call("POST","/auth/refresh",null,p("refreshToken",owner.refresh()),200);call("GET","/me/workspaces",owner,null,401);
        var current=new User(rotated.path("accessToken").asText(),rotated.path("refreshToken").asText(),owner.workspace(),owner.member(),owner.user(),owner.email());call("GET","/me/workspaces",current,null,200);
        assertThat(call("POST","/auth/refresh",null,p("refreshToken",owner.refresh()),401).path("error").path("code").asText()).isEqualTo("REFRESH_REUSE_DETECTED");call("GET","/me/workspaces",current,null,401);
    }
    @Test void sourceBindingAndCompositeForeignKeysEnforceTenantIntegrity()throws Exception{
        var a=user();var b=user();UUID ac=uuid(child(a),"id"),bc=uuid(child(b),"id"),camera=camera(a,ac);
        worker("/detections",p("workspaceId",b.workspace(),"childId",bc,"sourceId",camera,"sourceEventId","forged","type","edge_proximity","severity","caution","startedAt",Instant.now(),"verifiable",true,"confidence",0.9),404);
        UUID link=(UUID)db.required("SELECT id FROM workspace_children WHERE child_id=:id",p("id",ac),"missing").get("id");
        assertThatThrownBy(()->db.update("INSERT INTO child_access_grants(id,workspace_child_id,membership_id,workspace_id,capabilities,valid_from) VALUES(:id,:wc,:m,:ws,'[\"detection:read\"]',now())",p("id",UUID.randomUUID(),"wc",link,"m",b.member(),"ws",a.workspace()))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }
    @Test void cannotDisableImportantAlertsAndLogoutImmediatelyInvalidatesJwt()throws Exception{
        var owner=user();call("PATCH","/preferences/notifications",owner,p("importantAlerts",false),422);
        var preferences=call("PATCH","/preferences/notifications",owner,p("pushEnabled",true),200);assertThat(preferences.path("importantAlerts").asBoolean()).isTrue();assertThat(preferences.path("pushDeliveryAvailable").asBoolean()).isFalse();
        call("POST","/auth/logout",owner,Map.of(),200);call("GET","/children",owner,null,401);
    }
    @Test void failedOutboxRetriesThenDeadLettersAndCanBeRequeued()throws Exception{
        var owner=user();UUID child=uuid(child(owner),"id");detection(owner,child,camera(owner,child),"edge_proximity","caution",Instant.now().minusSeconds(3));
        var task=db.required("SELECT * FROM outbox_messages",Map.of(),"missing");UUID id=id(task,"id");Object payload=task.get("payload");
        db.update("UPDATE outbox_messages SET payload=cast(:payload as jsonb) WHERE id=:id",p("id",id,"payload",db.json(p("childId",child,"severity","caution","recipients",List.of("invalid-recipient")))));
        for(int i=0;i<5;i++){assertThat(outbox.dispatchOne()).isFalse();db.update("UPDATE outbox_messages SET next_attempt_at=now() WHERE id=:id",p("id",id));}
        var failed=db.required("SELECT * FROM outbox_messages WHERE id=:id",p("id",id),"missing");assertThat(failed.get("dead_lettered_at")).isNotNull();assertThat(((Number)failed.get("retry_count")).intValue()).isEqualTo(5);assertThat(db.list("SELECT id FROM notifications",Map.of())).isEmpty();
        db.update("UPDATE outbox_messages SET payload=cast(:payload as jsonb) WHERE id=:id",p("id",id,"payload",db.json(payload)));outbox.retry(id);assertThat(outbox.dispatchOne()).isTrue();assertThat(db.list("SELECT id FROM notifications",Map.of())).hasSize(1);
    }
    @Test void acknowledgementsArePerUserEvenWhenGlobalStatusChanges()throws Exception{
        var owner=user();var target=user();var child=child(owner);UUID id=uuid(child,"id");var invited=invite(owner,target,child,List.of("detection:read","detection:ack"));target=accept(owner,target,invited);
        UUID event=uuid(detection(owner,id,camera(owner,id),"face_covered","immediate",Instant.now().minusSeconds(2)),"id");call("POST","/events/"+event+"/acknowledgements",owner,Map.of(),200);
        var detail=call("GET","/events/"+event,target,null,200);assertThat(detail.path("status").asText()).isEqualTo("acknowledged");assertThat(detail.path("acknowledgedAt").isNull()).isTrue();
        call("POST","/events/"+event+"/acknowledgements",target,Map.of(),200);assertThat(db.list("SELECT id FROM event_acknowledgements WHERE event_id=:id",p("id",event))).hasSize(2);
    }

    private record Pi(KeyPair keys,JsonNode session){}
    private Map<String,Object> proof(KeyPair keys,String purpose)throws Exception{
        return proof(keys,purpose,null);
    }
    private Map<String,Object> proof(KeyPair keys,String purpose,UUID target)throws Exception{
        String publicKey=Base64.getEncoder().encodeToString(keys.getPublic().getEncoded());var challenge=call("POST","/pairing/challenges",null,p("publicKey",publicKey,"purpose",purpose,"deviceId",target),200);
        var signer=Signature.getInstance("Ed25519");signer.initSign(keys.getPrivate());signer.update(PairingService.proofMessage(purpose,uuid(challenge,"challengeId"),challenge.path("nonce").asText(),target).getBytes(StandardCharsets.UTF_8));
        return p("publicKey",publicKey,"challengeId",uuid(challenge,"challengeId"),"nonce",challenge.path("nonce").asText(),"signature",Base64.getEncoder().encodeToString(signer.sign()));
    }
    private Pi pi()throws Exception{var keys=KeyPairGenerator.getInstance("Ed25519").generateKeyPair();return new Pi(keys,call("POST","/pairing/start",null,proof(keys,"pair"),200));}
    private JsonNode approve(User owner,UUID child,Pi pi,String key,int status)throws Exception{return call("POST","/device-pairings/approve",owner,p("code",pi.session().path("userCode").asText(),"childId",child,"name","지안이 침대 카메라"),key,status);}
    private JsonNode poll(Pi pi,int status)throws Exception{return call("POST","/pairing/token",null,p("deviceCode",pi.session().path("deviceCode").asText()),status);}
    private JsonNode deviceCall(String path,String token,Object body,int status)throws Exception{return response((body==null?get("/api/v1/device"+path):post("/api/v1/device"+path)).header("X-Device-Token",token).contentType("application/json").content(body==null?new byte[0]:json.writeValueAsBytes(body)),status);}

    @Test void pairingBindsToChildAndOnlyPiCanRedeemCredential()throws Exception{
        var owner=usernameUser();UUID child=uuid(child(owner),"id");var pi=pi();assertThat(pi.session().path("userCode").asText()).matches("[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}");
        assertThat(poll(pi,200).path("status").asText()).isEqualTo("pending");
        var inspection=call("POST","/device-pairings/inspect",owner,p("code",pi.session().path("userCode").asText()),200);assertThat(inspection.has("deviceCode")).isFalse();
        var approved=approve(owner,child,pi,"pair-once",200);assertThat(approved.has("accessToken")).isFalse();assertThat(approve(owner,child,pi,"pair-once",200)).isEqualTo(approved);
        var credentials=poll(pi,200);assertThat(poll(pi,200)).isEqualTo(credentials);String token=credentials.path("accessToken").asText();
        assertThat(deviceCall("/me",token,null,200).path("childId").asText()).isEqualTo(child.toString());
        deviceCall("/heartbeat",token,p("status","unverifiable","observedAt",Instant.now()),200);
        var devices=call("GET","/children/"+child+"/devices",owner,null,200);assertThat(devices.path("items").get(0).path("connected").asBoolean()).isTrue();assertThat(devices.path("items").get(0).has("tokenHash")).isFalse();
        call("POST","/pairing/token",null,p("deviceCode",pi.session().path("userCode").asText()),401);call("GET","/children",new User(token,"",owner.workspace(),owner.member(),owner.user(),owner.email()),null,401);
        assertThat(db.required("SELECT token_hash FROM device_credentials",Map.of(),"missing").get("token_hash")).isEqualTo(Secrets.hash(token));
    }
    @Test void deviceProofCannotBeForgedReplayedOrUsedForAnotherPurpose()throws Exception{
        var keys=KeyPairGenerator.getInstance("Ed25519").generateKeyPair();var signed=proof(keys,"pair");var forged=new LinkedHashMap<>(signed);forged.put("signature",Base64.getEncoder().encodeToString(new byte[64]));call("POST","/pairing/start",null,forged,401);
        call("POST","/pairing/start",null,signed,200);call("POST","/pairing/start",null,signed,401);
        call("POST","/pairing/start",null,proof(keys,"authenticate"),401);
        var expired=proof(keys,"pair");db.update("UPDATE device_challenges SET expires_at=now()-interval '1 second' WHERE id=:id",p("id",expired.get("challengeId")));call("POST","/pairing/start",null,expired,401);
    }
    @Test void pairedIdentityCannotCreateAnotherCodeBeforeUnlink()throws Exception{
        var owner=user();UUID child=uuid(child(owner),"id");var pi=pi();approve(owner,child,pi,"pair",200);
        assertThat(call("POST","/pairing/start",null,proof(pi.keys(),"pair"),409).path("error").path("code").asText()).isEqualTo("DEVICE_ALREADY_PAIRED");
    }
    @Test void pairingExpiryAndNewCodeInvalidateOldRequests()throws Exception{
        var owner=user();UUID child=uuid(child(owner),"id");var old=pi();var fresh=new Pi(old.keys(),call("POST","/pairing/start",null,proof(old.keys(),"pair"),200));
        approve(owner,child,old,"old",409);poll(old,409);
        db.update("UPDATE device_pairings SET expires_at=now()-interval '1 second' WHERE id=:id",p("id",uuid(fresh.session(),"pairingId")));approve(owner,child,fresh,"expired",409);poll(fresh,409);
    }
    @Test void onlyChildManagersCanPair()throws Exception{
        var owner=user();var target=user();var child=child(owner);var pi=pi();var invited=invite(owner,target,child,List.of("child:read"));target=accept(owner,target,invited);
        approve(target,uuid(child,"id"),pi,"viewer",403);

        var outsider=user();approve(outsider,uuid(child,"id"),pi,"wrong-workspace",404);
        assertThat(db.list("SELECT id FROM devices WHERE identity_id IS NOT NULL",Map.of())).isEmpty();
    }
    @Test void rebootReauthenticatesSameDeviceAndRotatesToken()throws Exception{
        var owner=user();UUID child=uuid(child(owner),"id");var pi=pi();approve(owner,child,pi,"pair",200);var previous=poll(pi,200);
        var renewed=call("POST","/device/authenticate",null,proof(pi.keys(),"authenticate"),200);assertThat(renewed.path("deviceId")).isEqualTo(previous.path("deviceId"));assertThat(renewed.path("accessToken")).isNotEqualTo(previous.path("accessToken"));
        deviceCall("/me",previous.path("accessToken").asText(),null,401);deviceCall("/me",renewed.path("accessToken").asText(),null,200);poll(pi,401);
    }
    @Test void unlinkStopsTokensAndStreamsAndAllowsExplicitReassignment()throws Exception{
        var owner=usernameUser();var child=child(owner);UUID id=uuid(child,"id");var pi=pi();var paired=approve(owner,id,pi,"pair",200);var credential=poll(pi,200);String token=credential.path("accessToken").asText();
        deviceCall("/heartbeat",token,p("status","live","observedAt",Instant.now(),"analysisObservedAt",Instant.now(),"confidence",0.9,"safety",p("face","stable","posture","stable","edge","stable","objects","stable")),200);
        call("POST","/children/"+id+"/stream-token",owner,Map.of(),410);
        call("DELETE","/devices/"+paired.path("deviceId").asText(),owner,null,200);deviceCall("/heartbeat",token,p("status","live","observedAt",Instant.now()),401);
        worker("/stream-tokens/introspect",p("token","retired"),410);worker("/devices/"+paired.path("deviceId").asText()+"/heartbeat",p("status","live","observedAt",Instant.now()),404);
        call("POST","/device/authenticate",null,proof(pi.keys(),"authenticate"),401);
        var newOwner=user();UUID newChild=uuid(child(newOwner),"id");var next=new Pi(pi.keys(),call("POST","/pairing/start",null,proof(pi.keys(),"pair"),200));approve(newOwner,newChild,next,"reassign",200);
        var newCredential=poll(next,200);assertThat(newCredential.path("deviceId")).isNotEqualTo(credential.path("deviceId"));assertThat(newCredential.path("childId").asText()).isEqualTo(newChild.toString());deviceCall("/me",token,null,401);
    }
    @Test void localUnlinkRevokesAccessKeepsHistoryAndAllowsNewCodeWithoutAccountLogin()throws Exception{
        var owner=user();UUID child=uuid(child(owner),"id");var pi=pi();UUID device=uuid(approve(owner,child,pi,"pair",200),"deviceId");String token=poll(pi,200).path("accessToken").asText();
        deviceCall("/heartbeat",token,p("status","live","observedAt",Instant.now(),"analysisObservedAt",Instant.now(),"confidence",0.9,"safety",p("face","stable","posture","stable","edge","stable","objects","stable")),200);
        call("POST","/children/"+child+"/stream-token",owner,Map.of(),410);
        var event=detection(owner,child,device,"edge_proximity","caution",Instant.now().minusSeconds(30));
        var signed=proof(pi.keys(),"unlink",device);
        assertThat(call("POST","/device/unlink",null,signed,200).path("unlinked").asBoolean()).isTrue();
        call("POST","/device/unlink",null,signed,401);
        deviceCall("/me",token,null,401);worker("/stream-tokens/introspect",p("token","retired"),410);
        assertThat(db.required("SELECT id FROM detection_events WHERE id=:id",p("id",uuid(event,"id")),"missing")).isNotEmpty();
        assertThat(db.list("SELECT id FROM monitoring_sessions WHERE source_id=:id AND ended_at IS NULL",p("id",device))).isEmpty();
        assertThat(db.list("SELECT id FROM audit_logs WHERE action='device.unlink.local' AND object_id=:id AND actor_user_id IS NULL",p("id",device))).hasSize(1);
        assertThat(call("POST","/device/unlink",null,proof(pi.keys(),"unlink",device),200).path("alreadyUnlinked").asBoolean()).isTrue();
        assertThat(call("POST","/pairing/start",null,proof(pi.keys(),"pair"),200).path("userCode").asText()).isNotBlank();
    }
    @Test void localUnlinkRequiresTheMatchingIdentityAndATargetBoundProof()throws Exception{
        var owner=user();UUID child=uuid(child(owner),"id");var pi=pi();UUID device=uuid(approve(owner,child,pi,"pair",200),"deviceId");String token=poll(pi,200).path("accessToken").asText();
        call("POST","/device/unlink",null,Map.of(),422);deviceCall("/unlink",token,Map.of(),422);
        call("POST","/device/unlink",null,proof(pi.keys(),"authenticate"),401);
        var other=KeyPairGenerator.getInstance("Ed25519").generateKeyPair();call("POST","/device/unlink",null,proof(other,"unlink",device),404);
        var forged=proof(pi.keys(),"unlink",device);forged.put("signature",Base64.getEncoder().encodeToString(new byte[64]));call("POST","/device/unlink",null,forged,401);
        var signed=proof(pi.keys(),"unlink",device);db.update("UPDATE device_challenges SET target_device_id=:other WHERE id=:id",p("other",UUID.randomUUID(),"id",signed.get("challengeId")));call("POST","/device/unlink",null,signed,401);
        var expired=proof(pi.keys(),"unlink",device);db.update("UPDATE device_challenges SET expires_at=now()-interval '1 second' WHERE id=:id",p("id",expired.get("challengeId")));call("POST","/device/unlink",null,expired,401);
        deviceCall("/me",token,null,200);
    }
    @Test void delayedLocalUnlinkCannotRevokeANewerApproval()throws Exception{
        var owner=user();UUID child=uuid(child(owner),"id");var pi=pi();UUID old=uuid(approve(owner,child,pi,"pair",200),"deviceId");
        var delayed=proof(pi.keys(),"unlink",old);call("DELETE","/devices/"+old,owner,null,200);
        var next=new Pi(pi.keys(),call("POST","/pairing/start",null,proof(pi.keys(),"pair"),200));approve(owner,child,next,"new-pair",200);String token=poll(next,200).path("accessToken").asText();
        assertThat(call("POST","/device/unlink",null,delayed,409).path("error").path("code").asText()).isEqualTo("DEVICE_BINDING_CHANGED");deviceCall("/me",token,null,200);
    }
    @Test void deviceCannotSelectAnotherWorkspaceOrChildWhenSubmittingDetection()throws Exception{
        var owner=user();UUID child=uuid(child(owner),"id"),other=uuid(child(owner),"id");var pi=pi();approve(owner,child,pi,"pair",200);String token=poll(pi,200).path("accessToken").asText();
        var event=deviceCall("/detections",token,p("workspaceId",UUID.randomUUID(),"childId",other,"sourceId",UUID.randomUUID(),"sourceEventId","test-scope","type","edge_proximity","severity","caution","startedAt",Instant.now(),"confidence",0.9,"verifiable",true),200);
        assertThat(event.path("childId").asText()).isEqualTo(child.toString());assertThat(event.path("workspaceId").asText()).isEqualTo(owner.workspace().toString());
        call("POST","/internal/detections",null,Map.of(),401);
    }
    @Test void concurrentOwnersCannotClaimOneDeviceTwice()throws Exception{
        var a=user();var b=user();UUID ac=uuid(child(a),"id"),bc=uuid(child(b),"id");var pi=pi();
        try(var pool=Executors.newVirtualThreadPerTaskExecutor()){
            var results=new ArrayList<Future<Integer>>();for(var item:List.of(p("user",a,"child",ac),p("user",b,"child",bc)))results.add(pool.submit(()->{User u=(User)item.get("user");return mvc.perform(post("/api/v1/device-pairings/approve").header("Authorization","Bearer "+u.token()).header("X-Workspace-Id",u.workspace()).header("Idempotency-Key","race").contentType("application/json").content(json.writeValueAsBytes(p("code",pi.session().path("userCode").asText(),"childId",item.get("child"),"name","우리 카메라")))).andReturn().getResponse().getStatus();}));
            assertThat(List.of(results.get(0).get(10,TimeUnit.SECONDS),results.get(1).get(10,TimeUnit.SECONDS))).containsExactlyInAnyOrder(200,409);
        }assertThat(db.list("SELECT id FROM devices WHERE identity_id IS NOT NULL",Map.of())).hasSize(1);
    }
    private Map<String,Object> skyStatus(Instant at) {
        return p("observedAt",at,"video",p("available",true,"observedAt",at,"posture","supine","airway","airway_visible","state","normal","bodyConfidence",0.9,"faceConfidence",0.2,"geometryValid",false,"fallState","monitoring"));
    }
    @Test void skyEyeUsesDeviceScopeAndExpiresUnsafeOrStaleObservations()throws Exception{
        var owner=user();var outsider=user();UUID child=uuid(child(owner),"id"),other=uuid(child(owner),"id");var pi=pi();approve(owner,child,pi,"sky",200);String token=poll(pi,200).path("accessToken").asText();
        var body=skyStatus(Instant.now());body.put("childId",other);
        deviceCall("/sky-eye/status",token,body,200);
        var item=call("GET","/children/"+child+"/sky-eye",owner,null,200).path("items").get(0);
        assertThat(item.path("safety").path("posture").asText()).isEqualTo("stable");assertThat(item.path("safety").path("face").asText()).isEqualTo("unknown");
        assertThat(item.path("safety").path("objects").asText()).isEqualTo("unknown");assertThat(item.path("safety").path("edge").asText()).isEqualTo("unknown");
        assertThat(item.path("status").has("audio")).isFalse();assertThat(item.path("status").has("personalization")).isFalse();
        call("GET","/children/"+child+"/sky-eye",outsider,null,404);
        assertThat(call("GET","/children/"+other+"/sky-eye",owner,null,200).path("items")).isEmpty();
        db.update("UPDATE sky_eye_status SET body=jsonb_set(body,'{observedAt}',to_jsonb(cast(:at as text)))",p("at",Instant.now().minusSeconds(60).toString()));
        item=call("GET","/children/"+child+"/sky-eye",owner,null,200).path("items").get(0);
        assertThat(item.path("status").path("video").path("available").asBoolean()).isFalse();assertThat(item.path("status").path("personalization").isMissingNode()).isTrue();
    }
    @Test void skyEyeHistoricalEventsDeduplicateAndNeverDispatchAlerts()throws Exception{
        var owner=user();UUID child=uuid(child(owner),"id");var pi=pi();approve(owner,child,pi,"sky",200);String token=poll(pi,200).path("accessToken").asText();
        Instant now=Instant.now();var quiet=skyStatus(now);
        deviceCall("/sky-eye/status",token,quiet,200);
        var event=p("id","a".repeat(64),"episodeKey","source:episode","kind","risk_started","riskType","prone","observedAt",Instant.now().minusSeconds(3600));
        deviceCall("/sky-eye/events",token,event,200);assertThat(deviceCall("/sky-eye/events",token,event,200).path("duplicate").asBoolean()).isTrue();
        var items=call("GET","/children/"+child+"/sky-eye",owner,null,200).path("items").get(0).path("events");assertThat(items).hasSize(1);assertThat(items.get(0).path("recent").asBoolean()).isFalse();
        assertThat(db.list("SELECT id FROM outbox_messages",Map.of())).isEmpty();
        event.put("kind","risk_ended");deviceCall("/sky-eye/events",token,event,409);
    }

    @Test void approvedPiWithoutSenderIsShownAsWaitingInsteadOfMissing()throws Exception{
        var owner=user();UUID child=uuid(child(owner),"id");var pi=pi();approve(owner,child,pi,"waiting",200);poll(pi,200);
        var item=call("GET","/children/"+child+"/sky-eye",owner,null,200).path("items").get(0);
        assertThat(item.path("reportState").asText()).isEqualTo("awaiting_sender");assertThat(item.path("lastReportAt").isNull()).isTrue();assertThat(item.path("alerts")).isEmpty();
    }
    private byte[] jpeg()throws Exception{
        var image=new java.awt.image.BufferedImage(8,8,java.awt.image.BufferedImage.TYPE_INT_RGB);
        var out=new java.io.ByteArrayOutputStream();javax.imageio.ImageIO.write(image,"JPEG",out);return out.toByteArray();
    }
    private MockHttpServletRequestBuilder uploadPhoto(String token,String alert,Instant at,byte[] bytes) {
        return post("/api/v1/device/alerts/"+alert+"/photo").header("X-Device-Token",token)
                .header("X-Frame-Captured-At",at.toString()).contentType("image/jpeg").content(bytes);
    }
    private MockHttpServletRequestBuilder uploadCapture(String token, Instant at, String state, byte[] jpeg) {
        return post("/api/v1/device/sky-eye/capture").header("X-Device-Token",token)
                .header("X-Frame-Captured-At",at.toString()).header("X-Frame-State",state)
                .contentType("image/jpeg").content(jpeg);
    }
    @Test void periodicCaptureKeepsLatestImageAndItsAnalysisInsideThePairedChild() throws Exception {
        var owner=user(); var outsider=user(); UUID child=uuid(child(owner),"id"),other=uuid(child(owner),"id");
        var pi=pi(); approve(owner,child,pi,"camera",200); var credential=poll(pi,200);
        String token=credential.path("accessToken").asText(),device=credential.path("deviceId").asText();
        String path="/api/v1/children/"+child+"/devices/"+device+"/capture";
        var caregiver=get(path).header("Authorization","Bearer "+owner.token()).header("X-Workspace-Id",owner.workspace());
        response(caregiver,204);
        Instant at=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        byte[] jpeg=jpeg();
        response(uploadCapture("bad-token",at,"normal",jpeg),401);
        response(uploadCapture(token,at.minusSeconds(60),"normal",jpeg),422);
        response(uploadCapture(token,at,"invalid",jpeg),422);
        response(uploadCapture(token,at,"unavailable",jpeg).header("X-Frame-Posture","prone"),422);
        response(uploadCapture(token,at,"normal",new byte[4]),422);
        response(uploadCapture(token,at,"normal",new byte[524289]),413);
        assertThat(response(uploadCapture(token,at.minusSeconds(2),"unavailable",jpeg),200).path("stored").asBoolean()).isTrue();
        var unavailable=mvc.perform(caregiver).andReturn().getResponse();
        assertThat(unavailable.getHeader("X-Frame-State")).isEqualTo("unavailable");
        assertThat(unavailable.getHeader("X-Frame-Posture")).isNull();
        var risk=uploadCapture(token,at,"risk",jpeg).header("X-Frame-Posture","prone").header("X-Frame-Airway","airway_covered");
        assertThat(response(risk,200).path("stored").asBoolean()).isTrue();
        assertThat(response(risk,200).path("stored").asBoolean()).isFalse();
        assertThat(response(uploadCapture(token,at.minusSeconds(1),"normal",jpeg),200).path("stored").asBoolean()).isFalse();
        var saved=mvc.perform(caregiver).andReturn().getResponse();
        assertThat(saved.getContentAsByteArray()).isEqualTo(jpeg);
        assertThat(saved.getHeader("X-Frame-Captured-At")).isEqualTo(at.toString());
        assertThat(saved.getHeader("X-Frame-State")).isEqualTo("risk");
        assertThat(saved.getHeader("X-Frame-Posture")).isEqualTo("prone");
        assertThat(saved.getHeader("X-Frame-Airway")).isEqualTo("airway_covered");
        assertThat(saved.getHeader("Cache-Control")).contains("no-store");
        assertThat(db.list("SELECT device_id FROM sky_eye_latest_captures",Map.of())).hasSize(1);
        assertThat(db.list("SELECT id FROM sky_eye_alerts",Map.of())).isEmpty();
        response(get(path),401);
        response(get(path).header("Authorization","Bearer "+outsider.token()).header("X-Workspace-Id",outsider.workspace()),404);
        response(get(path.replace(child.toString(),other.toString())).header("Authorization","Bearer "+owner.token()).header("X-Workspace-Id",owner.workspace()),404);
        call("DELETE","/devices/"+device,owner,null,200);
        response(caregiver,404);
        response(uploadCapture(token,at,"normal",jpeg),401);
        assertThat(db.list("SELECT device_id FROM sky_eye_latest_captures",Map.of())).isEmpty();
    }
    private JsonNode risk(String token,String key,String type,Instant at) throws Exception {
        return deviceCall("/sky-eye/events",token,p("id",key.repeat(64),"episodeKey",key,"kind","risk_started","riskType",type,"observedAt",at),200);
    }
    @Test void photoBelongsToOneAlertAndItsAuthorizedDeviceAndChild() throws Exception {
        var owner=user(); var outsider=user(); UUID child=uuid(child(owner),"id"),other=uuid(child(owner),"id");
        var pi=pi(); approve(owner,child,pi,"camera",200); var c=poll(pi,200);
        String token=c.path("accessToken").asText(),device=c.path("deviceId").asText();
        Instant at=Instant.now(); var photo=jpeg();
        String alert=risk(token,"a","prone",at).path("captures").get(0).path("id").asText();
        String path="/api/v1/children/"+child+"/devices/"+device+"/alerts/"+alert+"/photo";
        var caregiver=get(path).header("Authorization","Bearer "+owner.token()).header("X-Workspace-Id",owner.workspace());
        response(caregiver,204);
        response(uploadPhoto(token,alert,at.minusSeconds(20),photo),422);
        response(uploadPhoto(token,alert,at,"bad".getBytes(StandardCharsets.UTF_8)),422);
        response(uploadPhoto(token,alert,at,new byte[524289]),413);
        var otherPi=pi(); approve(owner,other,otherPi,"other",200);
        response(uploadPhoto(poll(otherPi,200).path("accessToken").asText(),alert,at,photo),404);
        response(uploadPhoto(token,alert,at,photo),200);
        var retry=jpeg(); retry[10]^=1;
        response(uploadPhoto(token,alert,at,retry),200);
        var saved=mvc.perform(caregiver).andReturn().getResponse();
        assertThat(saved.getContentAsByteArray()).isEqualTo(photo);
        assertThat(saved.getHeader("Cache-Control")).contains("no-store");
        assertThat(risk(token,"a","prone",at).path("captures")).isEmpty();
        String next=risk(token,"b","face_covered",at).path("captures").get(0).path("id").asText();
        response(get(path.replace(alert,next)).header("Authorization","Bearer "+owner.token()).header("X-Workspace-Id",owner.workspace()),204);
        response(get(path),401);
        response(get(path).header("Authorization","Bearer "+outsider.token()).header("X-Workspace-Id",outsider.workspace()),404);
        response(get(path.replace(child.toString(),other.toString())).header("Authorization","Bearer "+owner.token()).header("X-Workspace-Id",owner.workspace()),404);
        call("DELETE","/devices/"+device,owner,null,200);
        response(caregiver,404); response(uploadPhoto(token,alert,at,photo),401);
    }
    @Test void sustainedPostureRiskProducesOneCaptureAndANewAlertAfterRecovery() throws Exception {
        var owner=user(); UUID child=uuid(child(owner),"id"); var pi=pi(); approve(owner,child,pi,"camera",200);
        String token=poll(pi,200).path("accessToken").asText();
        Instant at=Instant.now();
        var normal=skyStatus(at); assertThat(deviceCall("/sky-eye/status",token,normal,200).path("captures")).isEmpty();
        var risk=skyStatus(at);
        risk.put("video",p("available",true,"observedAt",at,"posture","prone","state","risk","bodyConfidence",0.95));
        String first=deviceCall("/sky-eye/status",token,risk,200).path("captures").get(0).path("id").asText();
        assertThat(deviceCall("/sky-eye/status",token,risk,200).path("captures")).hasSize(1);
        assertThat(risk(token,"f","prone",at).path("captures").get(0).path("id").asText()).isEqualTo(first);
        // Move the healthy interval into the past without sleeping through device polling.
        deviceCall("/sky-eye/status",token,normal,200);
        db.update("UPDATE sky_eye_notice_state SET stable_since=now()-interval '11 seconds' WHERE field='posture'", Map.of());
        deviceCall("/sky-eye/status",token,normal,200);
        deviceCall("/sky-eye/status",token,risk,200);
        var alerts=call("GET","/children/"+child+"/sky-eye",owner,null,200).path("items").get(0).path("alerts");
        assertThat(alerts).hasSize(2);
    }

    @Test void unknownPostureWaitsForContinuousObservationsAndNeverUsesAnotherAlertsImage() throws Exception {
        var owner=user(); UUID child=uuid(child(owner),"id"); var pi=pi(); approve(owner,child,pi,"camera",200);
        String token=poll(pi,200).path("accessToken").asText();
        Instant at=Instant.now();
        var unknown=p("observedAt",at,"video",p("available",false,"state","unavailable"));
        assertThat(deviceCall("/sky-eye/status",token,unknown,200).path("captures")).isEmpty();
        db.update("UPDATE sky_eye_notice_state SET unknown_since=now()-interval '11 seconds'",Map.of());
        var alerts=deviceCall("/sky-eye/status",token,unknown,200).path("captures");
        assertThat(alerts).hasSize(2);
        assertThat(deviceCall("/sky-eye/status",token,unknown,200).path("captures")).isEqualTo(alerts);
        assertThat(db.list("SELECT id FROM sky_eye_alerts WHERE jpeg IS NOT NULL", Map.of())).isEmpty();
    }

    private Map<String,Object> changes(){return p("routines",List.of(),"deletedRoutines",List.of(),"sleepRecords",List.of(),"deletedSleepRecords",List.of());}
    @Test void dailyRecordsPersistPaginateAndRejectStaleAtomicEdits()throws Exception{
        var owner=user();var outsider=user();UUID child=uuid(child(owner),"id"),other=uuid(child(owner),"id");String path="/children/"+child+"/care-history";
        Instant start=Instant.parse("2026-01-20T14:00:00Z");UUID routine=UUID.randomUUID(),sleep=UUID.randomUUID();
        var r=p("id",routine,"type","play","title","놀이","note","메모","scheduledAt",start,"endedAt",start.plusSeconds(1800),"status","done");
        var s=p("id",sleep,"startedAt",start,"endedAt",start.plusSeconds(7200));
        var body=changes();body.put("routines",List.of(r));body.put("sleepRecords",List.of(s));
        var saved=call("PUT",path,owner,body,"day-one",200);assertThat(saved.path("routines").get(0).path("version").asInt()).isEqualTo(1);
        assertThat(call("PUT",path,owner,body,"day-one",200)).isEqualTo(saved);
        var more=changes();more.put("sleepRecords",List.of(p("id",UUID.randomUUID(),"startedAt",start.plusSeconds(3600),"endedAt",start.plusSeconds(10800))));call("PUT",path,owner,more,"day-two",200);
        var first=call("GET",path+"?kind=sleepRecords&limit=1",owner,null,200);String cursor=first.path("nextCursor").asText();assertThat(cursor).isNotBlank();
        var second=call("GET",path+"?kind=sleepRecords&limit=1&cursor="+cursor,owner,null,200);assertThat(second.path("items")).hasSize(1);assertThat(second.path("nextCursor").isNull()).isTrue();
        call("GET","/children/"+other+"/care-history?kind=sleepRecords&cursor="+cursor,owner,null,422);
        assertThat(call("GET","/children/"+child+"/summary?date=2026-01-20",owner,null,200).path("sleepMinutes").asInt()).isEqualTo(60);
        assertThat(call("GET","/children/"+child+"/summary?date=2026-01-21",owner,null,200).path("sleepMinutes").asInt()).isEqualTo(120);
        // The original routine API participates in optimistic version checks too.
        call("PATCH","/children/"+child+"/routines/"+routine,owner,p("title","다른 기기에서 수정"),200);
        r.put("version",1);s.put("version",1);s.put("endedAt",start.plusSeconds(4000));body.put("sleepRecords",List.of(s));
        call("PUT",path,owner,body,"stale-edit",409);
        assertThat(db.required("SELECT version FROM sleep_records WHERE id=:id",p("id",sleep),"test").get("version")).isEqualTo(1L);
        var deletion=changes();deletion.put("deletedRoutines",List.of(p("id",routine,"version",2)));
        call("PUT",path,outsider,deletion,"outsider",404);call("PUT",path,owner,deletion,"delete",200);
        assertThat(call("GET",path+"?kind=routines",owner,null,200).path("items")).isEmpty();
        var relogin=call("POST","/auth/login",null,p("email",owner.email(),"password","correct-password-123"),200);
        var signedIn=new User(relogin.path("accessToken").asText(),relogin.path("refreshToken").asText(),owner.workspace(),owner.member(),owner.user(),owner.email());
        assertThat(call("GET",path+"?kind=sleepRecords",signedIn,null,200).path("items")).hasSize(2);
    }
    @Test void invalidDailyRecordsRollbackAndReadOnlyGrantsCannotWrite()throws Exception{
        var owner=user();UUID child=uuid(child(owner),"id");String path="/children/"+child+"/care-history";Instant at=Instant.now().minusSeconds(1000);
        var body=changes();body.put("sleepRecords",List.of(p("id",UUID.randomUUID(),"startedAt",at,"endedAt",at.minusSeconds(1))));call("PUT",path,owner,body,"invalid",422);
        assertThat(call("GET",path+"?kind=sleepRecords",owner,null,200).path("items")).isEmpty();
        db.update("UPDATE child_access_grants SET capabilities=cast(:caps as jsonb) WHERE membership_id=:member",p("caps",db.json(List.of("child:read","routine:read","detection:read")),"member",owner.member()));
        body.put("sleepRecords",List.of(p("id",UUID.randomUUID(),"startedAt",at,"endedAt",at.plusSeconds(60))));call("PUT",path,owner,body,"read-only",403);
    }
    @Test void invalidPairingAttemptsAreRateLimitedAndPendingPollingSlowsDown()throws Exception{
        var owner=user();for(int i=0;i<10;i++)call("POST","/device-pairings/inspect",owner,p("code","ZZZZ-ZZZZ"),404);call("POST","/device-pairings/inspect",owner,p("code","ZZZZ-ZZZZ"),429);
        var pi=pi();poll(pi,200);assertThat(poll(pi,429).path("error").path("code").asText()).isEqualTo("PAIRING_SLOW_DOWN");
    }
    @Test void removedCryFeaturesCannotStoreRecordsOrProduceNotifications() throws Exception {
        var owner=usernameUser();UUID child=uuid(child(owner),"id");var pi=pi();approve(owner,child,pi,"camera-only",200);String token=poll(pi,200).path("accessToken").asText();
        deviceCall("/detections",token,p("sourceEventId","cry-disabled","type","cry","severity","caution","startedAt",Instant.now(),"verifiable",true,"confidence",0.9),422);
        deviceCall("/sky-eye/events",token,p("id","d".repeat(64),"episodeKey","cry","kind","cry_started","observedAt",Instant.now()),422);
        var body=skyStatus(Instant.now());body.put("audio",p("cryDetected",true));body.put("personalization",p("state","ready"));
        deviceCall("/sky-eye/status",token,body,200);
        var status=call("GET","/children/"+child+"/sky-eye",owner,null,200).path("items").get(0).path("status");
        assertThat(status.has("audio")).isFalse();assertThat(status.has("personalization")).isFalse();
        call("GET","/children/"+child+"/care-history?kind=cries",owner,null,422);
        call("GET","/children/"+child+"/care-history?kind=feedback",owner,null,422);
        call("GET","/children/"+child+"/events?type=cry",owner,null,422);
        call("POST","/events/"+UUID.randomUUID()+"/feedback",owner,Map.of(),404);
        assertThat(db.list("SELECT id FROM detection_events",Map.of())).isEmpty();
        assertThat(db.list("SELECT id FROM outbox_messages",Map.of())).isEmpty();
        assertThat(db.list("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('cry_occurrences','care_feedback','action_attempts','recommendations','cause_candidates','sky_eye_commands')",Map.of())).isEmpty();
    }

    @Test void webOnAnotherOriginCanCallTheApi()throws Exception{
        // Deployed web and API live on different origins, so every browser call is preflighted.
        var allowed=mvc.perform(options("/api/v1/children/x/care-history").header("Origin","http://localhost:5177")
            .header("Access-Control-Request-Method","PUT").header("Access-Control-Request-Headers","authorization,content-type,x-workspace-id,idempotency-key")).andReturn().getResponse();
        assertThat(allowed.getStatus()).isEqualTo(200);
        assertThat(allowed.getHeader("Access-Control-Allow-Origin")).isEqualTo("http://localhost:5177");
        var denied=mvc.perform(options("/api/v1/children").header("Origin","https://other.example").header("Access-Control-Request-Method","GET")).andReturn().getResponse();
        assertThat(denied.getStatus()).isEqualTo(403);
    }

    @Autowired com.agaeye.detection.EventService detectionEvents;@Autowired org.springframework.core.env.Environment environment;
    @Test void lostCameraIsReportedWithinTenSeconds()throws Exception{
        // NFR-03: power or network loss must reach the guardian within 10 s.
        assertThat(environment.getProperty("app.offline-after-seconds",Integer.class)).isEqualTo(7);
        assertThat(environment.getProperty("app.offline-check-interval-ms",Integer.class)).isEqualTo(1000);
        var owner=user();UUID child=uuid(child(owner),"id"),camera=camera(owner,child);heartbeat(camera,"live");
        // The scheduled bean is disabled in tests (outbox-enabled=false), so run the same check directly.
        var watchdog=new com.agaeye.monitoring.MonitoringWatchdog(db,detectionEvents,7,true);
        db.update("UPDATE devices SET last_seen_at=now()-interval '6 seconds' WHERE id=:id",p("id",camera));watchdog.check();
        assertThat(db.required("SELECT state FROM devices WHERE id=:id",p("id",camera),"MISSING").get("state")).isEqualTo("live");
        assertThat(db.list("SELECT id FROM detection_events WHERE source_id=:id AND type='connection_lost'",p("id",camera))).isEmpty();
        db.update("UPDATE devices SET last_seen_at=now()-interval '8 seconds' WHERE id=:id",p("id",camera));watchdog.check();
        assertThat(db.required("SELECT state FROM devices WHERE id=:id",p("id",camera),"MISSING").get("state")).isEqualTo("offline");
        assertThat(db.list("SELECT id FROM detection_events WHERE source_id=:id AND type='connection_lost'",p("id",camera))).hasSize(1);
    }
}
