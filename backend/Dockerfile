FROM maven:3.9.11-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml ./
COPY src ./src
RUN mvn -B -ntp -DskipTests package

FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
RUN groupadd --system agaeye && useradd --system --gid agaeye agaeye
COPY --from=build --chown=agaeye:agaeye /build/target/agaeye-backend-1.0.0.jar /app/agaeye.jar
USER agaeye
EXPOSE 8081
ENTRYPOINT ["java","-XX:MaxRAMPercentage=75","-jar","/app/agaeye.jar"]
